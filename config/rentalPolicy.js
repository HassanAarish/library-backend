/**
 * Business rules for rentals, packages and payments — kept in one place so
 * they're easy to review and change.
 */
const rentalPolicy = {
  // A booking awaiting payment holds its slot this long before it's released.
  paymentHoldMinutes: 30,
  // A package purchase may wait this long for its payment proof.
  packagePaymentHours: 24,

  // Fair use: per user, at any one time.
  maxActiveRentals: 2, // currently reading (start ≤ now < end)
  maxUpcomingRentals: 3, // booked for a future start

  // Furthest ahead a slot can start.
  maxAdvanceDays: 60,

  // One free extension per rental, only when nobody is booked right after it.
  extensionDays: 7,

  // Package credit expiry reminders (days before expiry).
  packageReminderDays: [30, 7],
};

export default rentalPolicy;
