/**
 * Rules for "please add this book" requests.
 */
const bookRequestPolicy = {
  // Open requests one user may be following at once (their own + ones they joined).
  maxOpenFollows: 20,

  // Requests created or joined, per user, per hour (spam guard).
  actionsPerHour: 20,
};

export default bookRequestPolicy;
