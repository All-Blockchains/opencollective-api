import { expect } from 'chai';
import { times } from 'lodash';

import { mergeAccounts, simulateMergeAccounts } from '../../../server/lib/merge-accounts';
import * as Faker from '../../test-helpers/fake-data';
import { resetTestDB } from '../../utils';

/** Helper to create an account with many associations */
const addFakeDataToAccount = async (account): Promise<void> => {
  await Promise.all([
    ...times(3, () => Faker.fakeActivity({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakeApplication({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakeCollective({ ParentCollectiveId: account.id })),
    ...times(3, () => Faker.fakeComment({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakeComment({ FromCollectiveId: account.id })),
    ...times(3, () => Faker.fakeConnectedAccount({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakeConversation({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakeConversation({ FromCollectiveId: account.id })),
    ...times(3, () => Faker.fakeTransaction({ FromCollectiveId: account.id })),
    ...times(3, () => Faker.fakeTransaction({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakeEmojiReaction({ FromCollectiveId: account.id })),
    ...times(3, () => Faker.fakeExpense({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakeExpense({ FromCollectiveId: account.id })),
    ...times(3, () => Faker.fakeTransaction({ UsingGiftCardFromCollectiveId: account.id })),
    // TODO ...times(3, () => Faker.fakeHostApplication({ HostCollectiveId: account.id })),
    // TODO ...times(3, () => Faker.fakeHostApplication({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakeCollective({ HostCollectiveId: account.id })),
    ...times(3, () => Faker.fakeLegalDocument({ CollectiveId: account.id })),
    // TODO ...times(3, () => Faker.fakeMemberInvitation({ MemberCollectiveId: account.id })),
    ...times(3, () => Faker.fakeMember({ MemberCollectiveId: account.id })),
    // TODO ...times(3, () => Faker.fakeMemberInvitation({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakeMember({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakeNotification({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakeOrder({ FromCollectiveId: account.id })),
    ...times(3, () => Faker.fakeOrder({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakePaymentMethod({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakePayoutMethod({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakePaypalProduct({ CollectiveId: account.id })),
    // TODO ...times(3, () => Faker.fakeRequiredLegalDocument({ HostCollectiveId: account.id })),
    ...times(3, () => Faker.fakeTier({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakeUpdate({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakeUpdate({ FromCollectiveId: account.id })),
    ...times(3, () => Faker.fakeUpdate({ CollectiveId: account.id })),
    ...times(3, () => Faker.fakeUpdate({ HostCollectiveId: account.id })),
  ]);
};

describe('server/lib/guest-accounts.ts', () => {
  beforeEach(async () => {
    await resetTestDB();

    // Create noise data to make sure merge tools don't affect others data
    await addFakeDataToAccount(await Faker.fakeCollective());
    await addFakeDataToAccount(await Faker.fakeOrganization());
    await addFakeDataToAccount((await Faker.fakeUser()).collective);
  });

  describe('simulateMergeAccounts', () => {
    it('Correctly estimates the number of items to move for collective account', async () => {
      // Prepare test data
      const from = await Faker.fakeCollective();
      const to = await Faker.fakeCollective();
      await addFakeDataToAccount(from);
      await addFakeDataToAccount(to);

      // Generate & check summary
      const summary = await simulateMergeAccounts(from, to);
      expect(summary).to.eq('TODO');
    });

    it('Correctly estimates the number of items to move for user account', async () => {
      // Prepare test data
      const fromUser = await Faker.fakeUser();
      const toUser = await Faker.fakeUser();
      await addFakeDataToAccount(fromUser.collective);
      await addFakeDataToAccount(toUser.collective);

      // Generate & check summary
      const summary = await simulateMergeAccounts(fromUser.collective, toUser.collective);
      expect(summary).to.eq('TODO');
    });
  });

  describe('mergeAccounts', () => {
    it('Merges an organization', async () => {
      // Prepare test data
      const from = await Faker.fakeCollective();
      const to = await Faker.fakeCollective();
      await addFakeDataToAccount(from);
      await addFakeDataToAccount(to);
      await mergeAccounts(from, to);

      // Profile info
      // Associated data
      // Removes merged profile
      // Doesn't touch other data
    });

    it('Merges a user profile', async () => {
      // Prepare test data
      const fromUser = await Faker.fakeUser();
      const toUser = await Faker.fakeUser();
      await addFakeDataToAccount(fromUser.collective);
      await addFakeDataToAccount(toUser.collective);
      await mergeAccounts(fromUser.collective, toUser.collective);

      // Profile info
      // Associated data
      // UserId/CreatedByUserId
      // Removes merged profile
      // Removes merged user
      // Doesn't touch other data
    });
  });
});
