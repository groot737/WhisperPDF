require('dotenv').config();
const express                     = require('express');
const router                      = express.Router();
const stripe                      = require('stripe')(process.env.stripe_secret_key)
const { PrismaClient, Prisma }    = require('@prisma/client');
const {adminMiddleware}           = require('../controllers/checkuser')
const prisma                      = new PrismaClient();
const {transporter, emailOption}  = require('../config/nodemailer-config')


router.get('/', (req, res) => {
  res.render('payment')
})


// ======== LIFETIME PLAN ENDPOINT =======================//
router.post('/lifetime',adminMiddleware, async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price: process.env.lifetime_price_id,
        quantity: 1,
      },
    ],
    payment_intent_data : {
      "metadata": {
        "userId": req.user.id,
      }
    },
    mode: 'payment',
    customer_email: req.user.email,
    success_url: process.env.DOMAIN + `checkout/complete/{CHECKOUT_SESSION_ID}/1`,
    cancel_url: process.env.DOMAIN + `checkout/checkout/`

  })
  res.redirect(303, session.url);
})

// ======== SUBSCRIPTION PLAN ENDPOINT =======================//
router.post('/subscription', adminMiddleware, async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price:  process.env.subscription_price_id,
        quantity: 1,
      },
    ],
    subscription_data: {
      metadata: {
        "userId": req.user.id,
      }
    },
    mode: 'subscription',
    customer_email: req.user.email,
    success_url: process.env.DOMAIN + `checkout/complete/{CHECKOUT_SESSION_ID}/2`,
    cancel_url: process.env.DOMAIN + `checkout/`
  });


  res.redirect(303, session.url);
})

// ======== COMPLETE PAGE ENDPOINT =======================//
router.get('/complete/:id/:type', adminMiddleware, async (req, res) => {
  const sessionId = req.params.id;
  const type = +req.params.type; // Ensure type is a number
  const planId = type === 1 ? 1 : type === 2 ? 2 : null;

  if (!planId) {
    res.redirect('/')
    return res.status(400).send('Invalid type');
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId);

    let paymentIntentId, paymentIntent, subscriptionId, subscription, status;

    if (type === 1) {
      paymentIntentId = session.payment_intent;
      if (!paymentIntentId) {
        res.redirect('/')
        throw new Error('Payment intent ID not found in the session.');
      }
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      status = paymentIntent ? paymentIntent.status : 'unknown';
    } else if (type === 2) {
      subscriptionId = session.subscription;
      if (!subscriptionId) {
        res.redirect('/')
        throw new Error('Subscription ID not found in the session.');
      }
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const invoice = await stripe.invoices.retrieve(subscription.latest_invoice);
      status = invoice ? invoice.status : 'unknown';
    }

    const transaction = await prisma.transaction.create({
      data: {
        user_id: req.user.id,
        plan_id: planId,
        created_at: new Date(),
        transaction_id: subscriptionId,
        status: status,
      }
    });

    const endDate = planId === 1 ? new Date('9999-09-09') : new Date(new Date().setMonth(new Date().getMonth() + 1));

    await prisma.subscriber.create({
      data: {
        user_id: req.user.id,
        plan_id: planId,
        start_date: new Date(),
        end_date: endDate,
        status: "active"
      }
    });

    emailOption['subject'] = (planId === 1 ? "lifetime" : "subscription") + " purchased"
    emailOption['to'] = req.user.email
    emailOption['text'] = "Congrats! you've successfully become our premium member😭❤️"
    transporter.sendMail(emailOption);

    res.send('payment success');
  } catch (error) {
    console.error('Error retrieving transaction details:', error.message);
    res.redirect('/');
  }
});


// ======== CANCEL PLAN ENDPOINT =======================//
router.get('/cancel-plan',adminMiddleware, async (req, res) => {
  const current_plan = await prisma.subscriber.findMany({
    where: {user_id: req.user.id}
  })
  if(current_plan.plan_id == 1){
    const removeSubscription = await prisma.subscriber.deleteMany({
      where: {user_id: req.user.id}
    })
  } else{
    const transaction = await prisma.transaction.findMany({
      where: {user_id: req.user.id, plan_id: 2}
    })
    // user might purchased subscription again so we have to get lastest transaction related to user
    const transactionId = transaction.slice(-1)[0].transaction_id
    const subscription = await stripe.subscriptions.cancel(
      transactionId
    )
    .then(() => {
      res.send('subscription cancelled')
    })
  }
})

module.exports = router