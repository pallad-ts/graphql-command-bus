import {GraphQLInt, GraphQLObjectType, GraphQLString} from 'graphql';

export const QueryResultMetaPaginationByNode = new GraphQLObjectType({
    name: 'Query_Result_Meta_PaginationByNode',
    fields: {
        nextPage: {type: GraphQLString},
        previousPage: {type: GraphQLString},
        limit: {type: GraphQLInt}
    }
})

export const QueryResultMetaPaginationByOffset = new GraphQLObjectType({
    name: 'Query_Result_Meta_PaginationByOffset',
    fields: {
        limit: {type: GraphQLInt},
        offset: {type: GraphQLInt}
    }
});
