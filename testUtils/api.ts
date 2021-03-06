import { InMemoryCache } from "apollo-cache-inmemory";
import { BatchHttpLink } from "apollo-link-batch-http";
import ApolloClient from "apollo-client";
import { setupPolly } from "setup-polly-jest";
import { Polly } from "@pollyjs/core";
import fetch from "node-fetch";
import NodeHttpAdapter from "@pollyjs/adapter-node-http";
import FSPersister from "@pollyjs/persister-fs";
import path from "path";

Polly.register(NodeHttpAdapter);
Polly.register(FSPersister);

function setupAPI() {
  setupPolly({
    adapterOptions: {
      fetch: {
        context: global,
      },
    },
    adapters: ["node-http"],
    matchRequestsBy: {
      headers: false,
      url: {
        hash: false,
        hostname: false,
        password: false,
        pathname: false,
        port: false,
        protocol: false,
        query: false,
        username: false,
      },
    },
    persister: "fs",
    persisterOptions: {
      fs: {
        recordingsDir: path.resolve(__dirname, "../recordings"),
      },
    },
    recordIfMissing: true,
  });
  const cache = new InMemoryCache();
  const link = new BatchHttpLink({
    // @ts-ignore
    fetch,
    uri: process.env.API_URL || "http://localhost:8000/graphql/",
  });
  const client = new ApolloClient({
    cache,
    link,
  });

  return { cache, client };
}

export default setupAPI;
