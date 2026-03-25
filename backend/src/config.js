export const config = {
  get URL_FEEDBACK_TABLE() { return process.env.URL_FEEDBACK_TABLE; },
  get WHITELIST_TABLE() { return process.env.WHITELIST_TABLE; },
  get SENDER_MAPPING_FEEDBACK_TABLE() { return process.env.SENDER_MAPPING_FEEDBACK_TABLE; },
  get SENDER_DOMAIN_MAPPING_TABLE() { return process.env.SENDER_DOMAIN_MAPPING_TABLE; },
get SENDER_MAPPING_URL_THRESHOLD() { return parseInt(process.env.SENDER_MAPPING_URL_THRESHOLD ?? '3', 10); },
};
