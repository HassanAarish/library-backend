import { getEnv } from "../../config/dotenv.js";
import ErrorResponse from "../../utils/errorResponse.js";

/**
 * Payment providers. Each one knows how a user pays and what to show them.
 * Rentals and packages only ever talk to this interface, so adding a gateway
 * (or Stripe, for international users) means adding a provider here — nothing
 * in the rental flow changes.
 *
 * A provider:
 *   key          — stored on Payment.method
 *   manual       — true when an admin verifies the proof (no webhook)
 *   isConfigured() — false until its account details are set
 *   instructions(payment) — what the client shows the user
 */
const easypaisa = {
  key: "easypaisa",
  label: "Easypaisa",
  manual: true,

  account() {
    return {
      title: getEnv("EASYPAISA_ACCOUNT_TITLE"),
      number: getEnv("EASYPAISA_ACCOUNT_NUMBER"),
    };
  },

  isConfigured() {
    const { title, number } = this.account();
    return Boolean(title && number);
  },

  instructions(payment) {
    const { title, number } = this.account();
    return {
      method: this.key,
      label: this.label,
      accountTitle: title,
      accountNumber: number,
      amount: payment.amount,
      currency: payment.currency,
      reference: payment.reference,
      payBefore: payment.expiresAt,
      steps: [
        `Send exactly Rs. ${payment.amount} to Easypaisa account ${number} (${title}).`,
        `Write the reference ${payment.reference} in the transfer note if your app allows it.`,
        "Copy the Transaction ID (TID) from your Easypaisa receipt and take a screenshot of it.",
        "Submit the TID and screenshot here. We'll confirm your payment shortly.",
      ],
    };
  },
};

const PROVIDERS = { [easypaisa.key]: easypaisa };

export const DEFAULT_PROVIDER = easypaisa.key;

/**
 * @param {string} [key]
 * @returns the provider, ready to take payments
 */
export const getProvider = (key = DEFAULT_PROVIDER) => {
  const provider = PROVIDERS[key];
  if (!provider) throw new ErrorResponse(`Unsupported payment method: ${key}`, 400);
  if (!provider.isConfigured()) {
    throw new ErrorResponse("Online payments aren't available yet. Please try again later.", 503);
  }
  return provider;
};

// Public list of configured methods (no account numbers until a payment exists).
export const listProviders = () =>
  Object.values(PROVIDERS)
    .filter((p) => p.isConfigured())
    .map((p) => ({ method: p.key, label: p.label, manual: p.manual }));
