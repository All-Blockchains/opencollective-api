import { isEmpty, keys, pick } from 'lodash';

import OrderStatus from '../constants/order_status';
import { Unauthorized } from '../graphql/errors';
import models, { sequelize } from '../models';

import { findPaymentMethodProvider } from './payments';

const getIsSubscriptionManagedExternally = pm => {
  const provider = findPaymentMethodProvider(pm);
  return Boolean(provider?.features?.isRecurringManagedExternally);
};

export const updatePaymentMethodForSubscription = async (
  user: typeof models.User,
  order: typeof models.Order,
  newPaymentMethod: typeof models.PaymentMethod,
): Promise<typeof models.Order> => {
  const prevPaymentMethod = order.paymentMethod;
  const newPaymentMethodCollective = await newPaymentMethod.getCollective();
  if (!user.isAdminOfCollective(newPaymentMethodCollective)) {
    throw new Unauthorized("You don't have permission to use this payment method");
  }

  // Order changes
  const newStatus = order.status === OrderStatus.ERROR ? OrderStatus.ACTIVE : order.status;
  const newOrderData = { PaymentMethodId: newPaymentMethod.id, status: newStatus };

  // Subscription changes
  let newSubscriptionData;
  const wasManagedExternally = getIsSubscriptionManagedExternally(prevPaymentMethod);
  const isManagedExternally = getIsSubscriptionManagedExternally(newPaymentMethod);
  if (wasManagedExternally !== isManagedExternally) {
    newSubscriptionData = { isManagedExternally, paypalSubscriptionId: null };
  }

  const { order: updatedOrder } = await updateOrderSubscription(order, null, newOrderData, newSubscriptionData, {});
  return updatedOrder;
};

const checkSubscriptionDetails = (order, tier, amountInCents) => {
  if (tier && tier.CollectiveId !== order.CollectiveId) {
    throw new Error(`This tier (#${tier.id}) doesn't belong to the given Collective #${order.CollectiveId}`);
  }

  // The amount can never be less than $1.00
  if (amountInCents < 100) {
    throw new Error('Invalid amount.');
  }

  // If using a named tier, amount can never be less than the minimum amount
  if (tier && tier.amountType === 'FLEXIBLE' && amountInCents < tier.minimumAmount) {
    throw new Error('Amount is less than minimum value allowed for this Tier.');
  }

  // If using a FIXED tier, amount cannot be different from the tier's amount
  // TODO: it should be amountInCents !== tier.amount, but we need to do work to make sure that would play well with platform fees/taxes
  if (tier && tier.amountType === 'FIXED' && amountInCents < tier.amount) {
    throw new Error('Amount is incorrect for this Tier.');
  }
};

type OrderSubscriptionUpdate = {
  order: typeof models.Order;
  previousOrderValues: Record<string, unknown>;
  previousSubscriptionValues: Record<string, unknown>;
};

/**
 * Update the order and the subscription in a single transaction. Returns the modified values
 * for each, to easily rollback if necessary.
 */
export const updateOrderSubscription = async (
  order: typeof models.Order,
  member: typeof models.Member,
  newOrderData: Record<string, unknown>,
  newSubscriptionData: Record<string, unknown>,
  newMemberData: Record<string, unknown>,
): Promise<OrderSubscriptionUpdate> => {
  const previousOrderValues = pick(order.dataValues, keys(newOrderData));
  const previousSubscriptionValues = pick(order.Subscription.dataValues, keys(newSubscriptionData));

  if (isEmpty(newOrderData) && isEmpty(newSubscriptionData)) {
    return { order, previousOrderValues, previousSubscriptionValues };
  }

  return sequelize.transaction(async transaction => {
    if (!isEmpty(newOrderData)) {
      order = await order.update(newOrderData, { transaction });
    }

    if (!isEmpty(newSubscriptionData)) {
      order.Subscription = await order.Subscription.update(newSubscriptionData, { transaction });
    }

    if (member && !isEmpty(newMemberData)) {
      member = await member.update(newMemberData, { transaction });
    }

    return { order, member, previousOrderValues, previousSubscriptionValues };
  });
};

export const updateSubscriptionDetails = async (
  order: typeof models.Order,
  tier: typeof models.Tier,
  member: typeof models.Member,
  amountInCents: number,
): Promise<OrderSubscriptionUpdate> => {
  // Make sure the new details are ok values, that match tier's minimum amount if there's one
  checkSubscriptionDetails(order, tier, amountInCents);

  const newOrderData = {};
  const newSubscriptionData = {};
  const newMemberData = {};

  // check if the amount is different from the previous amount
  if (amountInCents !== order.totalAmount) {
    newOrderData['totalAmount'] = amountInCents;
    newSubscriptionData['amount'] = amountInCents;
  }

  // Update interval
  if (tier?.interval && tier.interval !== 'flexible' && tier.interval !== order.interval) {
    newOrderData['interval'] = tier.interval;
    newSubscriptionData['interval'] = tier.interval;
  }

  // Update order's Tier
  const newTierId = tier?.id || null;
  if (newTierId !== order.TierId) {
    newOrderData['TierId'] = newTierId;
    newMemberData['TierId'] = newTierId;
  }

  // Backup previous values
  return updateOrderSubscription(order, member, newOrderData, newSubscriptionData, newMemberData);
};
