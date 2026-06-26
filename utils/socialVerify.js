import { OAuth2Client } from "google-auth-library";
import appleSignin from "apple-signin-auth";
import { getEnv } from "../config/dotenv.js";
import ErrorResponse from "./errorResponse.js";

const GOOGLE_CLIENT_ID = getEnv("GOOGLE_CLIENT_ID");
const APPLE_CLIENT_ID = getEnv("APPLE_CLIENT_ID");
const FACEBOOK_APP_ID = getEnv("FACEBOOK_APP_ID");
const FACEBOOK_APP_SECRET = getEnv("FACEBOOK_APP_SECRET");

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

/**
 * Each verifier returns a normalized identity:
 *   { providerId, email, emailVerified, name, picture }
 * `email` / `name` / `picture` may be undefined depending on the provider and
 * what the user shared. `providerId` is always present on success.
 */

// Google: cryptographically verify the OIDC id_token against Google's keys.
const verifyGoogleToken = async (token) => {
  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
  } catch {
    throw new ErrorResponse("Invalid or expired Google token", 401);
  }

  const payload = ticket.getPayload();
  return {
    providerId: payload.sub,
    email: payload.email?.toLowerCase(),
    emailVerified: Boolean(payload.email_verified),
    name: payload.name,
    picture: payload.picture,
  };
};

// Apple: verify the id_token against Apple's JWKS. Apple does NOT include the
// user's name in the token (it's sent separately on first sign-in), so name is
// supplied by the caller.
const verifyAppleToken = async (token) => {
  let payload;
  try {
    payload = await appleSignin.verifyIdToken(token, { audience: APPLE_CLIENT_ID });
  } catch {
    throw new ErrorResponse("Invalid or expired Apple token", 401);
  }

  return {
    providerId: payload.sub,
    email: payload.email?.toLowerCase(),
    // Apple returns email_verified as the string "true" (or a boolean).
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    name: undefined,
    picture: undefined,
  };
};

// Facebook: there is no signed id_token — verify the access token via the Graph
// API. debug_token confirms the token was issued for THIS app (blocks tokens
// minted for a different app), then /me fetches the profile.
const verifyFacebookToken = async (token) => {
  const appToken = `${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`;

  let debug;
  try {
    const res = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`,
    );
    debug = (await res.json())?.data;
  } catch {
    throw new ErrorResponse("Could not verify Facebook token", 401);
  }

  if (!debug?.is_valid || String(debug.app_id) !== String(FACEBOOK_APP_ID)) {
    throw new ErrorResponse("Invalid Facebook token", 401);
  }

  let profile;
  try {
    const res = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(token)}`,
    );
    profile = await res.json();
  } catch {
    throw new ErrorResponse("Could not fetch Facebook profile", 401);
  }

  if (!profile?.id) {
    throw new ErrorResponse("Invalid Facebook profile", 401);
  }

  return {
    providerId: profile.id,
    email: profile.email?.toLowerCase(),
    // Facebook has no email_verified claim; it verifies emails on its side, so a
    // returned email is treated as verified. (Explicit, reviewable decision.)
    emailVerified: Boolean(profile.email),
    name: profile.name,
    picture: profile.picture?.data?.url,
  };
};

const VERIFIERS = {
  google: verifyGoogleToken,
  apple: verifyAppleToken,
  facebook: verifyFacebookToken,
};

export const verifySocialToken = async (provider, token) => {
  const verify = VERIFIERS[provider];
  if (!verify) {
    throw new ErrorResponse("Unsupported social provider", 400);
  }
  return verify(token);
};
