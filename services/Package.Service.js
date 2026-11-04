import PackagePlan from "../models/PackagePlan.Model.js";
import Payment from "../models/Payment.Model.js";
import UserPackage from "../models/UserPackage.Model.js";
import policy from "../config/rentalPolicy.js";
import ErrorResponse from "../utils/errorResponse.js";
import helper from "../utils/helper.js";
import { audit } from "../utils/audit.js";
import { createPayment, getInstructions } from "./Payment.Service.js";

const PLAN_FIELDS = [
  "name",
  "description",
  "credits",
  "price",
  "validityDays",
  "isActive",
  "sortOrder",
];

// --- Plans

export const getActivePlans = () =>
  PackagePlan.find({ isActive: true })
    .sort({ sortOrder: 1, credits: 1 })
    .select("name description credits price currency validityDays")
    .lean();

export const getAllPlans = () => PackagePlan.find().sort({ sortOrder: 1, credits: 1 }).lean();

export const createPlan = async (body, session = null) => {
  const plan = new PackagePlan(helper.pick(body, PLAN_FIELDS));
  const saved = await plan.save({ session });

  audit("admin.package_plan.create", {
    target: { type: "PackagePlan", id: saved._id },
    metadata: helper.pick(saved.toObject(), PLAN_FIELDS),
  });

  return saved;
};

/**
 * Edits apply to future purchases only — every UserPackage keeps a snapshot of
 * the plan as it was bought.
 */
export const updatePlan = async (planId, body, session = null) => {
  const plan = await PackagePlan.findById(planId).session(session);
  if (!plan) throw new ErrorResponse("Package plan not found", 404);

  const changes = helper.pick(body, PLAN_FIELDS);
  const before = helper.pick(plan.toObject(), Object.keys(changes));

  plan.set(changes);
  const saved = await plan.save({ session });

  audit("admin.package_plan.update", {
    target: { type: "PackagePlan", id: plan._id },
    metadata: { before, after: changes },
  });

  return saved;
};

// --- Purchases

export const purchase = async (planId, userId, method, session = null) => {
  const plan = await PackagePlan.findOne({ _id: planId, isActive: true }).session(session);
  if (!plan) throw new ErrorResponse("Package plan not found", 404);

  const pending = await UserPackage.exists({ user: userId, status: "pending_payment" }).session(
    session,
  );
  if (pending) {
    throw new ErrorResponse(
      "You already have a package purchase waiting for payment. Complete or cancel it first.",
      409,
    );
  }

  const userPackage = new UserPackage({
    user: userId,
    plan: plan._id,
    snapshot: {
      name: plan.name,
      credits: plan.credits,
      price: plan.price,
      validityDays: plan.validityDays,
    },
    creditsTotal: plan.credits,
  });

  const payment = await createPayment(
    {
      userId,
      purpose: "package",
      userPackageId: userPackage._id,
      amount: plan.price,
      method,
      expiresAt: new Date(Date.now() + policy.packagePaymentHours * 60 * 60 * 1000),
    },
    session,
  );

  userPackage.payment = payment._id;
  await userPackage.save({ session });

  audit("package.purchase", {
    target: { type: "UserPackage", id: userPackage._id },
    metadata: {
      plan: plan.name,
      credits: plan.credits,
      price: plan.price,
      reference: payment.reference,
    },
  });

  return {
    userPackage,
    payment: {
      _id: payment._id,
      reference: payment.reference,
      amount: payment.amount,
      status: payment.status,
      instructions: getInstructions(payment),
    },
  };
};

/** Cancel a purchase whose payment proof hasn't been sent yet. */
export const cancelPurchase = async (userPackageId, userId, session = null) => {
  const userPackage = await UserPackage.findOne({ _id: userPackageId, user: userId }).session(
    session,
  );
  if (!userPackage) throw new ErrorResponse("Package not found", 404);

  const payment = await Payment.findById(userPackage.payment).session(session);

  if (userPackage.status !== "pending_payment" || payment?.status !== "awaiting_proof") {
    throw new ErrorResponse("Only a purchase that hasn't been paid yet can be cancelled.", 400);
  }

  userPackage.status = "cancelled";
  payment.status = "cancelled";
  await Promise.all([userPackage.save({ session }), payment.save({ session })]);

  audit("package.cancel", { target: { type: "UserPackage", id: userPackage._id } });

  return userPackage;
};

/** The user's packages plus how many credits they can use right now. */
export const getMyPackages = async (userId) => {
  const packages = await UserPackage.find({ user: userId })
    .sort({ createdAt: -1 })
    .populate({
      path: "payment",
      select: "reference amount currency method status expiresAt rejectionReason",
    })
    .lean();

  const now = new Date();
  const usable = packages.filter((p) => p.status === "active" && p.expiresAt > now);

  return {
    creditsAvailable: usable.reduce((sum, p) => sum + (p.creditsTotal - p.creditsUsed), 0),
    // Credits that run out first are used first.
    nextExpiry:
      usable
        .filter((p) => p.creditsTotal > p.creditsUsed)
        .map((p) => p.expiresAt)
        .sort((a, b) => a - b)[0] ?? null,
    packages: packages.map((p) => ({
      ...p,
      creditsLeft: Math.max(0, p.creditsTotal - p.creditsUsed),
      instructions:
        p.status === "pending_payment" && p.payment?.status === "awaiting_proof"
          ? getInstructions(p.payment)
          : undefined,
    })),
  };
};

export const getAdminPackages = (req) =>
  helper.paginate(UserPackage, req, {
    sort: { createdAt: -1 },
    filterFields: ["status", "user", "plan"],
    populate: [
      { path: "user", select: "name email" },
      { path: "payment", select: "reference amount status" },
    ],
  });
