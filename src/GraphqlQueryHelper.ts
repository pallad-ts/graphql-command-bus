import {GraphQLInputObjectType, Thunk, GraphQLNonNull, GraphQLList, GraphQLEnumType, GraphQLInt, GraphQLString, GraphQLObjectType} from 'graphql';
import {GraphQLInputFieldConfigMap} from 'graphql/type/definition';
import {ObjectTypeComposer} from 'graphql-compose';


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

function createSortByType(prefix: string, fields: string[]) {
    return new GraphQLList(
        new GraphQLInputObjectType({
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
    );
}

export namespace GraphqlQueryHelper {
    export function createQueryType(options: QueryOptions) {

        const prefix = options.filters.name
            .replace(/_Filters/i, '')
            .replace(/_Query/i, '');

        const fields: Thunk<GraphQLInputFieldConfigMap> = {
            filters: {type: new GraphQLNonNull(options.filters)}
        };

        if (options.sortableFields) {
            fields.sortBy = {type: createSortByType(prefix, options.sortableFields)};
        }
        if (options.pagination) {
            fields.limit = {type: GraphQLInt};
            if ('byLimit' in options.pagination) {
                fields.offset = {type: GraphQLInt};
            } else if ('byOffset' in options.pagination) {
                fields.after = {type: GraphQLString};
                fields.before = {type: GraphQLString}
            }
        }

        return new GraphQLInputObjectType({
            name: prefix + '_Query',
            fields
        });
    }

    export function createQueryResultType(type: ObjectTypeComposer<any>) {
        return new GraphQLObjectType({
            name: type.getTypeName() + '_Query_Result',
            fields: {
                results: {type: type.getTypePlural().getType()}
            }
        });
    }

    export type PaginationOptions = { byLimit: true } | { byOffset: true };

    export interface QueryOptions {
        filters: GraphQLInputObjectType,
        sortableFields?: string[],
        pagination?: PaginationOptions
    }
}


