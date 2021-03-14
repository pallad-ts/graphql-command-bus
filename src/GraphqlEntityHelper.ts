import {GraphqlMapper} from './GraphqlMapper';
import {DataLoaderManager, DataLoader} from '@pallad/dataloader-manager';
import {ObjectTypeComposer} from 'graphql-compose';
import {ID} from '@pallad/id';
import {AsyncOrSync} from 'ts-essentials';
import {GraphQLID, GraphQLNonNull} from 'graphql';
import {GraphqlQueryHelper} from './GraphqlQueryHelper';
import {Command} from 'alpha-command-bus-core';

export class GraphqlEntityHelper<TEntity,
    TGQLContext extends GraphqlMapper.BasicGQLContext<TDataLoaderContext> = any,
    TCommandBusContext = any,
    TDataLoaderContext = any> {

    constructor(private entityType: ObjectTypeComposer<TEntity, TGQLContext>,
                private mapper: GraphqlMapper,
                private dataLoaderManager: DataLoaderManager
    ) {
    }

    static DEFAULT_ID_EXTRACTOR: GraphqlEntityHelper.IDExtractor = (result) => {
        return result.id;
    };

    static DEFAULT_RESULT_EXTRACTOR: GraphqlEntityHelper.ResultExtractor = (result) => {
        if (result === null || result === undefined) {
            return [];
        }

        if (Array.isArray(result)) {
            return result;
        }

        if ('results' in result) {
            return result.results;
        }

        throw new Error('Could not extract array results');
    }

    createFindByIdResolver<TResult = any, TKey = ID>(options: GraphqlEntityHelper.FindByIdResolverOptions<TResult, TKey, TCommandBusContext, TDataLoaderContext>) {
        const dataLoaderName = options.dataLoaderName || this.entityType.getTypeName() + '.findById';

        const dataLoaderFactory = (context: TDataLoaderContext) => {
            return new DataLoader<TKey, TResult>(async keys => {
                const command = await options.commandFactory(keys.slice(), context);

                const result = await this.mapper.handleCommand(command, options.context, context, options.resultHandler);

                const arrayExtractor = options.resultsExtractor || GraphqlEntityHelper.DEFAULT_RESULT_EXTRACTOR;
                const finalResult = arrayExtractor(result);

                if (!Array.isArray(finalResult)) {
                    return [];
                }

                const idExtractor = options.idExtractor || GraphqlEntityHelper.DEFAULT_ID_EXTRACTOR;
                const resultMap = new Map();
                for (const entry of finalResult) {
                    finalResult && resultMap.set(idExtractor(entry), entry);
                }
                return keys.map(x => resultMap.get(x)!);
            });
        }

        this.dataLoaderManager.registerDataLoaderType(
            dataLoaderName,
            dataLoaderFactory
        );

        this.entityType.addResolver({
            name: 'findById',
            type: this.entityType.getType(),
            args: {
                id: {type: new GraphQLNonNull(GraphQLID)}
            },
            resolve: this.mapper.createDataLoaderResolver(dataLoaderName, 'id')
        });

        return this.getFindByIdResolver();
    }

    getFindByIdResolver() {
        return this.entityType.getResolver('findById');
    }

    createQueryResolver<TQuery>(options: GraphqlEntityHelper.QueryResolverOptions<any, TCommandBusContext>) {
        this.entityType.addResolver({
            name: 'query',
            args: {
                query: GraphqlQueryHelper.createQueryType(options)
            },
            type: GraphqlQueryHelper.createQueryResultType(this.entityType),
            resolve: this.mapper.createResolver<{ query: TQuery }, TEntity>({
                commandFactory: options.commandFactory,
                context: options.context
            }).rp
        });

        return this.getQueryResolver();
    }

    getQueryResolver() {
        return this.entityType.getResolver('query');
    }
}


export namespace GraphqlEntityHelper {
    export type IDExtractor<TResult = any, TKey = ID> = (result: TResult) => TKey;
    export type ResultExtractor<TResult = any> = (result: any) => TResult[];

    export interface FindByIdResolverOptions<TResult = any, TKey = ID, TCommandBusContext = any, TDataLoaderContext = any> {
        dataLoaderName?: string;
        commandFactory: (keys: TKey[], context: TDataLoaderContext) => AsyncOrSync<Command>;
        idExtractor?: IDExtractor<TResult, TKey>;
        resultHandler?: GraphqlMapper.ResultHandler;
        resultsExtractor?: ResultExtractor<TResult>;
        context: TCommandBusContext;
    }

    export interface QueryResolverOptions<TQuery, TContext> extends GraphqlQueryHelper.QueryOptions {
        commandFactory: (query: TQuery) => AsyncOrSync<Command>;
        context: TContext;
    }
}
