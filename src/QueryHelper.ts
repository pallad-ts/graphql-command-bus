import {GraphQLInputObjectType, ThunkObjMap, GraphQLNonNull, GraphQLList, GraphQLEnumType, GraphQLInt, GraphQLString, GraphQLObjectType} from 'graphql';
import {GraphQLInputFieldConfig} from 'graphql/type/definition';
import {ObjectTypeComposer} from 'graphql-compose';
import {QueryResultMetaPaginationByNode, QueryResultMetaPaginationByOffset} from './GQL';


const SORT_DIRECTION = new GraphQLEnumType({
	name: 'SortDirection',
	values: {
		ASC: {
			value: 'ASC'
		},
		DESC: {
			value: 'DESC'
		}
	}
});

function createSortByDefinitionType(prefix: string, fields: string[]) {
	return new GraphQLInputObjectType({
		name: prefix + '_Query_Sort',
		fields: {
			direction: {type: SORT_DIRECTION},
			field: {
				type: new GraphQLEnumType({
					name: prefix + '_Query_Sort_Field',
					values: fields.reduce((result, field) => {
						result[field] = {value: field};
						return result;
					}, {} as any)
				})
			}
		}
	})
}

export namespace QueryHelper {
	export function createQueryType(options: QueryOptions) {

		const prefix = options.filters.name
			.replace(/_Filters/i, '')
			.replace(/_Query/i, '');

		const fields: ThunkObjMap<GraphQLInputFieldConfig> = {
			filters: {type: new GraphQLNonNull(options.filters)}
		};

		if (options.sortableFields) {
			fields.sortBy = {
				type:
					options.singleSortable ?
						createSortByDefinitionType(prefix, options.sortableFields) :
						new GraphQLList(createSortByDefinitionType(prefix, options.sortableFields))
			};
		}
		if (options.pagination) {
			fields.limit = {type: GraphQLInt};
			if ('byOffset' in options.pagination) {
				fields.offset = {type: GraphQLInt};
			} else if ('byNode' in options.pagination) {
				fields.after = {type: GraphQLString};
				fields.before = {type: GraphQLString}
			}
		}

		return new GraphQLInputObjectType({
			name: prefix + '_Query',
			fields
		});
	}

	export function createQueryResultType(type: ObjectTypeComposer<any>, pagination?: PaginationOptions) {
		const metaType = getMetaTypeForPaginationOptions(pagination);
		return new GraphQLObjectType({
			name: type.getTypeName() + '_Query_Result',
			fields: {
				results: {type: type.getTypePlural().getType()},
				...(metaType ? {meta: {type: metaType}} : {})
			}
		});
	}

	export type PaginationOptions = { byNode: true } | { byOffset: true };

	export interface QueryOptions {
		filters: GraphQLInputObjectType,
		sortableFields?: string[],
		singleSortable?: boolean;
		pagination?: PaginationOptions
	}
}

function getMetaTypeForPaginationOptions(pagination?: QueryHelper.PaginationOptions) {
	if (!pagination) {
		return;
	}

	if ('byNode' in pagination && pagination.byNode) {
		return QueryResultMetaPaginationByNode;
	}

	if ('byOffset' in pagination && pagination.byOffset) {
		return QueryResultMetaPaginationByOffset;
	}
}

