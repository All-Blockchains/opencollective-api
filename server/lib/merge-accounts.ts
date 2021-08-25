import { isEmpty, some } from 'lodash';

import { types as CollectiveTypes } from '../constants/collectives';
import models, { sequelize } from '../models';
import { MigrationLogType } from '../models/MigrationLog';

import { DEFAULT_GUEST_NAME } from './guest-accounts';

const mergeCollectiveFields = async (from, into, transaction) => {
  const fieldsToUpdate = {};
  const isTmpName = name => !name || name === DEFAULT_GUEST_NAME || name === 'Incognito';
  if (isTmpName(into.name) && !isTmpName(from.name)) {
    fieldsToUpdate['name'] = from.name;
  }

  if (from.countryISO && !into.countryISO) {
    fieldsToUpdate['countryISO'] = from.countryISO;
  }

  if (from.address && !into.address) {
    fieldsToUpdate['address'] = from.address;
  }

  return isEmpty(fieldsToUpdate) ? into : into.update(fieldsToUpdate, { transaction });
};

/**
 * Get a summary of all items handled by the `mergeAccounts` function
 */
const getMovableItemsCount = async fromCollective => {
  const summary = {};
  for (const entity of Object.keys(collectiveFieldsConfig)) {
    const entityConfig = collectiveFieldsConfig[entity];
    summary[entity] = await entityConfig.model.count({ where: { [entityConfig.field]: fromCollective.id } });
  }

  return summary;
};

const checkMergeCollective = (from: typeof models.Collective, into: typeof models.Collective): void => {
  if (!from || !into) {
    throw new Error('Cannot merge profiles, one of them does not exist');
  } else if (from.type !== into.type) {
    throw new Error('Cannot merge accounts with different types');
  } else if (from.id === into.id) {
    throw new Error('Cannot merge an account into itself');
  } else if (from.id === into.ParentCollectiveId) {
    throw new Error('You can not merge an account with its parent');
  } else if (from.id === into.HostCollectiveId) {
    throw new Error('You can not merge an account with its host');
  }
};

/**
 * Simulate the `mergeAccounts` function. Returns a summary of the changes as a string
 */
export const simulateMergeAccounts = async (
  from: typeof models.Collective,
  into: typeof models.Collective,
): Promise<string> => {
  // Detect errors that would completely block the process (throws)
  checkMergeCollective(from, into);

  // Generate a summary of the changes
  const movedItemsCounts = await getMovableItemsCount(from);
  let summary = 'The profiles information will be merged.\n\n';

  const addLineToSummary = str => {
    summary += `${str}\n`;
  };

  const addCountsToSummary = counts => {
    Object.entries(counts).forEach(([key, count]) => {
      if (count > 0) {
        addLineToSummary(`  - ${key}: ${count}`);
      }
    });
  };

  if (some(movedItemsCounts, count => count > 0)) {
    addLineToSummary(`The following items will be moved to @${into.slug}:`);
    addCountsToSummary(movedItemsCounts);
    addLineToSummary('');
  }

  return summary;
};

// Defines the collective field names used in the DB. Useful to prevent typos in the config below
type CollectiveField =
  | 'CollectiveId'
  | 'HostCollectiveId'
  | 'ParentCollectiveId'
  | 'FromCollectiveId'
  | 'UsingGiftCardFromCollectiveId'
  | 'MemberCollectiveId';

type CollectiveFieldsConfig = Record<string, { model: typeof models.Collective; field: CollectiveField }>;

/**
 * A map of entities to migrate. The key must be a name given for these entities, and the value
 * must include a model, and a field where the old account ID will be replaced by the new one.
 */
const collectiveFieldsConfig: CollectiveFieldsConfig = {
  activities: { model: models.Activity, field: 'CollectiveId' },
  applications: { model: models.Application, field: 'CollectiveId' },
  childrenCollectives: { model: models.Collective, field: 'ParentCollectiveId' },
  comments: { model: models.Comment, field: 'CollectiveId' },
  commentsCreated: { model: models.Comment, field: 'FromCollectiveId' },
  connectedAccounts: { model: models.ConnectedAccount, field: 'CollectiveId' },
  conversations: { model: models.Conversation, field: 'CollectiveId' },
  conversationsCreated: { model: models.Conversation, field: 'FromCollectiveId' },
  creditTransactions: { model: models.Transaction, field: 'FromCollectiveId' },
  debitTransactions: { model: models.Transaction, field: 'CollectiveId' },
  emojiReactions: { model: models.EmojiReaction, field: 'FromCollectiveId' },
  expenses: { model: models.Expense, field: 'CollectiveId' },
  expensesCreated: { model: models.Expense, field: 'FromCollectiveId' },
  giftCardTransactions: { model: models.Transaction, field: 'UsingGiftCardFromCollectiveId' },
  hostApplications: { model: models.HostApplication, field: 'HostCollectiveId' },
  hostApplicationsCreated: { model: models.HostApplication, field: 'CollectiveId' },
  hostedCollectives: { model: models.Collective, field: 'HostCollectiveId' },
  legalDocuments: { model: models.LegalDocument, field: 'CollectiveId' },
  memberInvitations: { model: models.MemberInvitation, field: 'MemberCollectiveId' },
  members: { model: models.Member, field: 'MemberCollectiveId' },
  membershipInvitations: { model: models.MemberInvitation, field: 'CollectiveId' },
  memberships: { model: models.Member, field: 'CollectiveId' },
  notifications: { model: models.Notification, field: 'CollectiveId' },
  ordersCreated: { model: models.Order, field: 'FromCollectiveId' },
  ordersReceived: { model: models.Order, field: 'CollectiveId' },
  paymentMethods: { model: models.PaymentMethod, field: 'CollectiveId' },
  payoutMethods: { model: models.PayoutMethod, field: 'CollectiveId' },
  paypalProducts: { model: models.PaypalProduct, field: 'CollectiveId' },
  requiredLegalDocuments: { model: models.RequiredLegalDocument, field: 'HostCollectiveId' },
  tiers: { model: models.Tier, field: 'CollectiveId' },
  updates: { model: models.Update, field: 'CollectiveId' },
  updatesCreated: { model: models.Update, field: 'FromCollectiveId' },
  virtualCards: { model: models.Update, field: 'CollectiveId' },
  virtualCardsHosted: { model: models.Update, field: 'HostCollectiveId' },
};

const userIdFieldsConfig = {
  activities: { model: models.Activity, field: 'UserId' },
  applications: { model: models.Application, field: 'CreatedByUserId' },
  collectives: { model: models.Collective, field: 'CreatedByUserId' },
  comments: { model: models.Comment, field: 'CreatedByUserId' },
  conversationFollowers: { model: models.ConversationFollower, field: 'UserId' },
  conversations: { model: models.Conversation, field: 'CreatedByUserId' },
  emojiReactions: { model: models.EmojiReaction, field: 'UserId' },
  expenseAttachedFiles: { model: models.ExpenseAttachedFile, field: 'CreatedByUserId' },
  expenseItems: { model: models.ExpenseItem, field: 'CreatedByUserId' },
  expenses: { model: models.Expense, field: 'UserId' },
  memberInvitations: { model: models.MemberInvitation, field: 'CreatedByUserId' },
  members: { model: models.Member, field: 'CreatedByUserId' },
  migrationLogs: { model: models.MigrationLog, field: 'CreatedByUserId' },
  notifications: { model: models.Notification, field: 'UserId' },
  orders: { model: models.Order, field: 'CreatedByUserId' },
  paymentMethods: { model: models.PaymentMethod, field: 'CreatedByUserId' },
  payoutMethods: { model: models.PayoutMethod, field: 'CreatedByUserId' },
  transactions: { model: models.Transaction, field: 'CreatedByUserId' },
  updates: { model: models.Update, field: 'CreatedByUserId' },
  virtualCards: { model: models.VirtualCard, field: 'UserId' },
};

/**
 * An helper to merge a collective with another one, with some limitations.
 */
export const mergeAccounts = async (
  from: typeof models.Collective,
  into: typeof models.Collective,
  userId: number | null = null,
): Promise<void> => {
  // Make sure all conditions are met before we start
  checkMergeCollective(from, into);

  // When moving users, we'll also update the user entries
  let fromUser, toUser;
  if (from.type === CollectiveTypes.USER) {
    fromUser = await models.User.findOne({ where: { CollectiveId: from.id } });
    toUser = await models.User.findOne({ where: { CollectiveId: into.id } });
    if (!fromUser || !toUser) {
      throw new Error('Cannot find one of the user entries to merge');
    }
  }

  // Trigger the merge in a transaction
  return sequelize.transaction(async transaction => {
    // Update collective
    await mergeCollectiveFields(from, into, transaction);

    // Update all related models
    const changesSummary = { fromAccount: from.id, intoAccount: into.id, fromUser: fromUser?.id };
    for (const entity of Object.keys(collectiveFieldsConfig)) {
      const entityConfig = collectiveFieldsConfig[entity];
      changesSummary[entity] = await entityConfig.model.update(
        { [entityConfig.field]: into.id },
        { where: { [entityConfig.field]: from.id }, transaction, returning: ['id'] },
      );
    }

    if (fromUser) {
      // Move all `UserId`/`CreatedByUserId` fields
      for (const entity of Object.keys(userIdFieldsConfig)) {
        const entityConfig = userIdFieldsConfig[entity];
        changesSummary['userChanges'][entity] = await models.update(
          { [entityConfig.field]: toUser.id },
          { where: { [entityConfig.field]: fromUser.id }, transaction, returning: ['id'] },
        );
      }

      // Mark fromUser as deleted
      await fromUser.destroy({ transaction });
    }

    // Mark from profile as deleted
    await models.Collective.update(
      {
        deletedAt: Date.now(),
        slug: `${from.slug}-merged`,
        data: { ...from.data, mergedIntoCollectiveId: into.id },
      },
      {
        where: { id: from.id },
        transaction,
      },
    );

    // Log everything
    await models.MigrationLog.create(
      {
        type: MigrationLogType.MERGE_ACCOUNTS,
        description: `Merge ${from.slug} into ${into.slug}`,
        CreatedByUserId: userId,
        data: changesSummary,
      },
      { transaction },
    );
  });
};
