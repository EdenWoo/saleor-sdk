import { User } from "../../fragments/gqlTypes/User";
import { ErrorListener } from "../../helpers";
import { JobsManager } from "../../jobs";
import { SaleorState, SaleorStateLoaded } from "../../state";
import { StateItems } from "../../state/types";

import { PromiseRunResponse } from "../types";
import { DataErrorAuthTypes } from "./types";
import { Config } from "../../types";

export const BROWSER_NO_CREDENTIAL_API_MESSAGE =
  "Saleor SDK is unable to use browser Credential Management API.";

export class AuthAPI extends ErrorListener {
  /**
   * Indicates if data is initialized, initially retrieved from cache or initially fetched.
   */
  loaded: boolean;

  /**
   * User object with currently signed in user data.
   */
  user?: User | null;

  /**
   * Indicates if user is signed in.
   */
  authenticated?: boolean;

  /**
   * Token used for user authentication.
   */
  token?: string;

  private saleorState: SaleorState;

  private jobsManager: JobsManager;

  private config: Config;

  constructor(
    saleorState: SaleorState,
    jobsManager: JobsManager,
    config: Config
  ) {
    super();
    this.saleorState = saleorState;
    this.jobsManager = jobsManager;
    this.config = config;

    this.loaded = false;

    this.saleorState.subscribeToChange(StateItems.USER, (user: User | null) => {
      this.user = user;
      if (this.loaded) {
        this.authenticated = !!this.user;
      }
    });
    this.saleorState.subscribeToChange(StateItems.SIGN_IN_TOKEN, token => {
      this.token = token;
    });
    this.saleorState.subscribeToChange(
      StateItems.LOADED,
      (loaded: SaleorStateLoaded) => {
        this.loaded = loaded.user && loaded.signInToken;
        if (this.loaded) {
          this.authenticated = !!this.user;
        }
      }
    );

    if (!this.saleorState.signInToken && window.PasswordCredential) {
      this.autoSignIn();
    }
  }

  /**
   * Tries to authenticate user with given email and password.
   * @param email Email used for authentication.
   * @param password Password used for authentication.
   * @param autoSignIn Indicates if SDK should try to sign in user with given credentials in future without explicitly calling this method. True by default.
   */
  signIn = async (
    email: string,
    password: string,
    autoSignIn: boolean = true
  ): PromiseRunResponse<DataErrorAuthTypes> => {
    const { data, dataError } = await this.jobsManager.run("auth", "signIn", {
      email,
      password,
    });

    try {
      if (autoSignIn && !dataError?.error && window.PasswordCredential) {
        await navigator.credentials.store(
          new window.PasswordCredential({
            id: email,
            password,
          })
        );
      }
    } catch (credentialsError) {
      // eslint-disable-next-line no-console
      console.warn(BROWSER_NO_CREDENTIAL_API_MESSAGE, credentialsError);
    }

    if (dataError) {
      return {
        data,
        dataError,
        pending: false,
      };
    }

    const {
      data: userData,
      dataError: userDataError,
    } = await this.jobsManager.run("auth", "provideUser", undefined);
    if (this.config.loadOnStart.checkout) {
      await this.jobsManager.run("checkout", "provideCheckout", {
        isUserSignedIn: !!data?.user,
      });
    }

    return {
      data: userData,
      dataError: userDataError,
      pending: false,
    };
  };

  /**
   * Sign out user by clearing cache, local storage and authentication token.
   */
  signOut = async (): PromiseRunResponse<DataErrorAuthTypes> => {
    await this.jobsManager.run("auth", "signOut", undefined);
    try {
      if (navigator.credentials && navigator.credentials.preventSilentAccess) {
        await navigator.credentials.preventSilentAccess();
      }
    } catch (credentialsError) {
      // eslint-disable-next-line no-console
      console.warn(BROWSER_NO_CREDENTIAL_API_MESSAGE, credentialsError);
    }

    return {
      pending: false,
    };
  };

  private autoSignIn = async () => {
    let credentials;
    try {
      credentials = await navigator.credentials.get({
        password: true,
      });
    } catch (credentialsError) {
      // eslint-disable-next-line no-console
      console.warn(BROWSER_NO_CREDENTIAL_API_MESSAGE, credentialsError);
    }

    if (credentials && "password" in credentials && credentials.password) {
      const { dataError } = await this.signIn(
        credentials.id,
        credentials.password,
        true
      );

      if (dataError?.error) {
        this.fireError(dataError.error, DataErrorAuthTypes.SIGN_IN);
      }
    }
  };
}
