const cron = require("node-cron");
const requestsService = require("../modules/requests/requests.service");
const analyticsService = require("../modules/analytics/analytics.service");

function startCronJobs() {
  // Every 5 min: widen the search radius for broadcast requests that still
  // need donors, and expire requests past their deadline.
  cron.schedule("*/5 * * * *", async () => {
    try {
      const expanded = await requestsService.expandStaleBroadcasts();
      const expired = await requestsService.expireOldRequests();
      if (expanded || expired) console.log(`[cron] expanded=${expanded} expired=${expired}`);
    } catch (err) {
      console.error("[cron] request sweep failed", err);
    }
  });

  // Once a day: refresh the admin analytics narrative so the LLM free tier
  // is only called a handful of times a day, not on every dashboard load.
  cron.schedule("0 6 * * *", async () => {
    try {
      await analyticsService.refreshNarrative(30);
      console.log("[cron] analytics narrative refreshed");
    } catch (err) {
      console.error("[cron] analytics refresh failed", err);
    }
  });
}

module.exports = { startCronJobs };
