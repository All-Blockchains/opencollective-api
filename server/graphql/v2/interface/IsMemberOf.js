import { GraphQLBoolean, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLString } from 'graphql';
import { invert, isNil } from 'lodash';

import { HOST_FEE_STRUCTURE } from '../../../constants/host-fee-structure';
import models, { Op, sequelize } from '../../../models';
import { ValidationFailed } from '../../errors';
import { MemberOfCollection } from '../collection/MemberCollection';
import { AccountType, AccountTypeToModelMapping } from '../enum/AccountType';
import { HostFeeStructure } from '../enum/HostFeeStructure';
import { MemberRole } from '../enum/MemberRole';
import { AccountReferenceInput, fetchAccountWithReference } from '../input/AccountReferenceInput';
import { ORDER_BY_PSEUDO_FIELDS, OrderByInput } from '../input/OrderByInput';

export const IsMemberOfFields = {
  memberOf: {
    type: MemberOfCollection,
    args: {
      limit: { type: GraphQLInt },
      offset: { type: GraphQLInt },
      role: { type: new GraphQLList(MemberRole) },
      accountType: { type: new GraphQLList(AccountType) },
      account: { type: AccountReferenceInput },
      isHostAccount: {
        type: GraphQLBoolean,
        description: 'Filter on whether the account is a host or not',
      },
      isApproved: {
        type: GraphQLBoolean,
        description: 'Filter on (un)approved collectives',
      },
      isArchived: {
        type: GraphQLBoolean,
        description: 'Filter on archived collectives',
      },
      includeIncognito: {
        type: GraphQLBoolean,
        defaultValue: true,
        description:
          'Whether incognito profiles should be included in the result. Only works if requesting user is an admin of the account.',
      },
      searchTerm: {
        type: GraphQLString,
        description:
          'A term to search membership. Searches in collective tags, name, slug, members description and role.',
      },
      hostFeesStructure: {
        type: HostFeeStructure,
        description: 'Filters on the Host fees structure applied to this account',
      },
      orderBy: {
        type: new GraphQLNonNull(OrderByInput),
        description: 'Order of the results',
        defaultValue: { field: ORDER_BY_PSEUDO_FIELDS.CREATED_AT, direction: 'DESC' },
      },
      orderByRoles: {
        type: GraphQLBoolean,
        description: 'Order the query by requested role order',
      },
    },
    async resolve(collective, args, req) {
      const where = { MemberCollectiveId: collective.id, CollectiveId: { [Op.ne]: collective.id } };
      const collectiveConditions = {};

      if (!isNil(args.isApproved)) {
        collectiveConditions.approvedAt = { [args.isApproved ? Op.not : Op.is]: null };
      }
      if (!isNil(args.isArchived)) {
        collectiveConditions.deactivatedAt = { [args.isArchived ? Op.not : Op.is]: null };
      }

      // No await needed, GraphQL will take care of it
      // TODO: try to skip if it's not a requested field
      const existingRoles = models.Member.findAll({
        attributes: ['role', 'collective.type'],
        where,
        include: [
          {
            model: models.Collective,
            as: 'collective',
            required: true,
            attributes: ['type'],
            where: collectiveConditions,
          },
        ],
        group: ['role', 'collective.type'],
        raw: true,
      }).then(results =>
        results.map(m => ({
          role: m.role,
          type: invert(AccountTypeToModelMapping)[m.type],
        })),
      );

      if (args.role && args.role.length > 0) {
        where.role = { [Op.in]: args.role };
      }
      if (args.accountType && args.accountType.length > 0) {
        collectiveConditions.type = {
          [Op.in]: args.accountType.map(value => AccountTypeToModelMapping[value]),
        };
      }
      if (args.account) {
        const account = await fetchAccountWithReference(args.account, { loaders: req.loaders });
        where.CollectiveId = account.id;
      }
      if (!args.includeIncognito || !req.remoteUser?.isAdmin(collective.id)) {
        collectiveConditions.isIncognito = false;
      }
      if (!isNil(args.isHostAccount)) {
        collectiveConditions.isHostAccount = args.isHostAccount;
      }

      if (args.hostFeesStructure) {
        if (args.hostFeesStructure === HOST_FEE_STRUCTURE.DEFAULT) {
          collectiveConditions.data = { useCustomHostFee: { [Op.not]: true } };
        } else if (args.hostFeesStructure === HOST_FEE_STRUCTURE.CUSTOM_FEE) {
          collectiveConditions.data = { useCustomHostFee: true };
        } else if (args.hostFeesStructure === HOST_FEE_STRUCTURE.MONTHLY_RETAINER) {
          throw new ValidationFailed('The MONTHLY_RETAINER fees structure is not supported yet');
        }
      }

      if (args.searchTerm) {
        const sanitizedTerm = args.searchTerm.replace(/(_|%|\\)/g, '\\$1');
        const ilikeQuery = `%${sanitizedTerm}%`;

        where[Op.or] = [
          { description: { [Op.iLike]: ilikeQuery } },
          { role: { [Op.iLike]: ilikeQuery } },
          { '$collective.slug$': { [Op.iLike]: ilikeQuery } },
          { '$collective.name$': { [Op.iLike]: ilikeQuery } },
          { '$collective.description$': { [Op.iLike]: ilikeQuery } },
          { '$collective.tags$': { [Op.overlap]: sequelize.cast([args.searchTerm.toLowerCase()], 'varchar[]') } },
        ];

        if (!isNaN(args.searchTerm)) {
          where[Op.or].push({ '$collective.id$': args.searchTerm });
        }
      }

      const order = [];
      const collectiveAttributesInclude = [];
      if (args.orderByRoles && args.role) {
        order.push(...args.role.map(r => sequelize.literal(`role='${r}' DESC`)));
      }
      if (args.orderBy) {
        const { field, direction } = args.orderBy;
        if (field === ORDER_BY_PSEUDO_FIELDS.MEMBER_COUNT) {
          order.push([sequelize.literal('"collective.memberCount"'), 'DESC']);
          collectiveAttributesInclude.push([
            sequelize.literal(`(
                    SELECT COUNT(*)
                    FROM "Members" AS "collective->members"
                    WHERE
                        "collective->members"."CollectiveId" = collective.id
                        AND "collective->members".role = 'BACKER'
                        AND "collective->members"."MemberCollectiveId" IS NOT NULL
                        AND "collective->members"."deletedAt" IS NULL
                )`),
            'memberCount',
          ]);
        } else if (field === ORDER_BY_PSEUDO_FIELDS.TOTAL_CONTRIBUTED) {
          order.push([sequelize.literal('"collective.totalAmountDonated"'), 'DESC']);
          collectiveAttributesInclude.push([
            sequelize.literal(`(
                    SELECT COALESCE(SUM("amount"), 0)
                    FROM "Transactions" AS "collective->transactions"
                    WHERE
                        "collective->transactions"."CollectiveId" = collective.id
                        AND "collective->transactions"."deletedAt" IS NULL
                        AND "collective->transactions"."type" = 'CREDIT'
                        AND (
                          "collective->transactions"."FromCollectiveId" = ${collective.id}
                          OR "collective->transactions"."UsingGiftCardFromCollectiveId" = ${collective.id}
                        )
                )`),
            'totalAmountDonated',
          ]);
        } else if (field === ORDER_BY_PSEUDO_FIELDS.CREATED_AT) {
          order.push(['createdAt', direction]);
        } else {
          order.push([field, direction]);
        }
      }

      const result = await models.Member.findAndCountAll({
        where,
        limit: args.limit,
        offset: args.offset,
        order,
        include: [
          {
            model: models.Collective,
            as: 'collective',
            where: collectiveConditions,
            required: true,
            attributes: {
              include: collectiveAttributesInclude,
            },
          },
        ],
      });

      return {
        nodes: result.rows,
        totalCount: result.count,
        limit: args.limit,
        offset: args.offset,
        roles: existingRoles,
      };
    },
  },
};
