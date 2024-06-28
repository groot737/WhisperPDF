// this code  is used to automatically update user subscription status using stripe sdk

const { PrismaClient } = require('@prisma/client');
const stripe = require('stripe')(process.env.stripe_secret_key);

const prisma = new PrismaClient();

async function updateSubscribers() {
  try {
    // Fetch all subscribers from Prisma
    const subscribers = await prisma.subscriber.findMany();
    // Extract userIds from subscribers for matching with Stripe subscriptions
    const subscriberUserIds = subscribers.map(subscriber => subscriber.user_id);

    // Fetch Stripe subscriptions related to these user ids
    const subscriptions = await stripe.subscriptions.list({
      limit: subscriberUserIds.length,
      expand: ['data.customer'],
    });

    // Process each Stripe subscription
    await Promise.all(subscriptions.data.map(async (subscription) => {
      const userId = subscription.metadata.userId;

      const matchedSubscriber = subscribers.find(subscriber => subscriber.user_id === +userId);

      if (matchedSubscriber) {
        const userKey = matchedSubscriber.id;

        // Handle inactive subscriptions
        if (subscription.status !== "active") {
          await prisma.subscriber.deleteMany({ where: { id: userKey } });
          console.log(`Subscriber ${userKey} deleted due to inactive subscription`);
        } else {
          // Update subscriber status
          await prisma.subscriber.update({
            where: { id: userKey },
            data: { status: subscription.status }
          });
          console.log('Subscriber status updated successfully');
        }
      } else {
        console.log(`No matching subscriber found for userId ${userId}.`);
      }
    }));

    console.log('Subscribers updated successfully.');
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateSubscribers();
