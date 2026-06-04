import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subscription: {
    endpoint: { type: String, required: true },
    keys: {
      p256dh: String,
      auth:   String,
    },
  },
}, { timestamps: true });

// One subscription per endpoint
pushSubscriptionSchema.index({ 'subscription.endpoint': 1 }, { unique: true });

export default mongoose.model('PushSubscription', pushSubscriptionSchema);
