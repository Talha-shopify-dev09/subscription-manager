import db from "../db.server";
import { sendEmail } from "../email.server";

const DEFAULT_WINDOW_MINUTES = 60;

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  const url = new URL(request.url);
  const token =
    request.headers.get("x-cron-secret") || url.searchParams.get("token");
  return token === secret;
}

async function handleCron(request) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const windowMinutes = Number(
    process.env.REMINDER_WINDOW_MINUTES || DEFAULT_WINDOW_MINUTES
  );
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);

  const contracts = await db.contract.findMany({
    where: {
      status: "ACTIVE",
      nextBillingDate: { not: null, gt: now, lte: windowEnd },
    },
    select: {
      id: true,
      shop: true,
      customerEmail: true,
      customerName: true,
      nextBillingDate: true,
      recurringPrice: true,
      currencyCode: true,
      lastReminderFor: true,
    },
  });

  const dueContracts = contracts.filter((contract) => {
    if (!contract.nextBillingDate) return false;
    if (!contract.lastReminderFor) return true;
    return contract.lastReminderFor.getTime() < contract.nextBillingDate.getTime();
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const contract of dueContracts) {
    if (!contract.customerEmail) {
      skipped += 1;
      continue;
    }

    const firstName = contract.customerName
      ? contract.customerName.split(" ")[0]
      : "there";
    const amount =
      contract.recurringPrice && contract.currencyCode
        ? `${contract.recurringPrice.toString()} ${contract.currencyCode}`
        : "your subscription";
    const portalUrl = `https://${contract.shop}/apps/subscription-manager/portal`;

    const result = await sendEmail({
      to: contract.customerEmail,
      senderName: `Socoba for ${contract.shop}`,
      subject: `[${contract.shop}] Upcoming Subscription Payment`,
      text:
        `Hi ${firstName},\n\n` +
        `This is a reminder that an automatic payment for ${amount} will be processed within the next hour.\n\n` +
        `Manage your subscriptions here: ${portalUrl}`,
      html:
        `<p>Hi ${firstName},</p>` +
        `<p>This is a reminder that an automatic payment for <b>${amount}</b> will be processed within the next hour.</p>` +
        `<p>Manage your subscriptions here: <a href="${portalUrl}">${portalUrl}</a></p>`,
    });

    if (result?.success) {
      sent += 1;
      await db.contract.update({
        where: { id: contract.id },
        data: {
          lastReminderFor: contract.nextBillingDate,
          lastReminderSentAt: now,
        },
      });
    } else {
      failed += 1;
    }
  }

  return Response.json({
    ok: true,
    windowMinutes,
    now: now.toISOString(),
    windowEnd: windowEnd.toISOString(),
    totalCandidates: contracts.length,
    due: dueContracts.length,
    sent,
    skipped,
    failed,
  });
}

export async function loader({ request }) {
  return handleCron(request);
}

export async function action({ request }) {
  return handleCron(request);
}
