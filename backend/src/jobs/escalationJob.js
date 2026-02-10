const cron = require('node-cron');
const escalationService = require('../services/escalationService');

/**
 * Auto-escalation Cron Job
 * Runs every 15 minutes to check and escalate overdue issues
 */
class EscalationJob {
  constructor() {
    this.isRunning = false;
    this.job = null;
  }

  /**
   * Start the escalation cron job
   * Runs every 15 minutes (normal operation)
   */
  start() {
    if (this.job) {
      console.log('Escalation job is already running');
      return;
    }

    // Run every 15 minutes: '*/15 * * * *' (normal operation)
    this.job = cron.schedule('*/15 * * * *', async () => {
      if (this.isRunning) {
        console.log('Escalation check already in progress, skipping...');
        return;
      }

      this.isRunning = true;
      console.log(`[${new Date().toISOString()}] Starting auto-escalation check...`);

      try {
        const result = await escalationService.checkAndEscalateIssues();
        console.log(`[${new Date().toISOString()}] Escalation check completed:`, {
          checked: result.checked,
          escalated: result.escalated,
          failed: result.failed
        });

        if (result.escalated > 0) {
          console.log(`Escalated ${result.escalated} issue(s):`, 
            result.results.filter(r => r.success).map(r => ({
              issueId: r.issueId,
              fromRole: r.fromRole,
              toRole: r.toRole
            }))
          );
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in escalation job:`, error);
      } finally {
        this.isRunning = false;
      }
    }, {
      scheduled: true,
      timezone: 'Asia/Kolkata'
    });

    console.log('Auto-escalation cron job started (runs every 15 minutes for normal operation)');
  }

  /**
   * Stop the escalation cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('Auto-escalation cron job stopped');
    }
  }

  /**
   * Manually trigger escalation check (for testing or admin use)
   */
  async runNow() {
    if (this.isRunning) {
      throw new Error('Escalation check already in progress');
    }

    this.isRunning = true;
    try {
      const result = await escalationService.checkAndEscalateIssues();
      return result;
    } finally {
      this.isRunning = false;
    }
  }
}

module.exports = new EscalationJob();

