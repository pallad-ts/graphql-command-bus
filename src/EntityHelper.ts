import {Mapper} from './Mapper';
import {DataLoaderManager, DataLoader} from '@pallad/dataloader-manager';
import {ObjectTypeComposer} from 'graphql-compose';
import {ID} from '@pallad/id';
import {GraphQLID, GraphQLNonNull} from 'graphql';
import {QueryHelper} from './QueryHelper';
import {Command} from 'alpha-command-bus-core';
import {Query} from '@pallad/query';

export class EntityHelper<TEntity,
    TContextOptions = any,
    TDataLoaderContext = any> {

    constructor(private entityType: ObjectTypeComposer<TEntity, any>,
                private mapper: Mapper,
                private dataLoaderManager: DataLoaderManager
    ) {
    }

    static DEFAULT_ID_EXTRACTOR: EntityHelper.IDExtractor = result => {
        return result.id;
    };

    static DEFAULT_RESULT_EXTRACTOR: EntityHelper.ResultExtractor = result => {
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

    createFindByIdResolver<TResult = any, TKey = ID>(options: EntityHelper.FindByIdResolverOptions<TResult, TKey, TContextOptions, TDataLoaderContext>) {
        const dataLoaderName = options.dataLoaderName || this.entityType.getTypeName() + '.findById';

        const dataLoaderFactory = (context: TDataLoaderContext) => {
            return new DataLoader<TKey, TResult>(async keys => {
                const command = await options.commandFactory(keys.slice(), context);

                const executionContext: Mapper.ExecutionContext<TContextOptions, any> = {
                    contextOptions: options.context!,
                    gqlContext: context
                };

                const result = await this.mapper.handleCommand(command, executionContext, options.resultHandler);

                const arrayExtractor = options.resultsExtractor || EntityHelper.DEFAULT_RESULT_EXTRACTOR;
                const finalResult = arrayExtractor(result);

                if (!Array.isArray(finalResult)) {
                    return [];
                }

                const idExtractor = options.idExtractor || EntityHelper.DEFAULT_ID_EXTRACTOR;
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

    createQueryResolver<TQuery extends Query<any>>(options: EntityHelper.QueryResolverOptions<any, TContextOptions>) {
        this.entityType.addResolver({
            name: 'query',
            args: {
                query: QueryHelper.createQueryType(options)
            },
            type: QueryHelper.createQueryResultType(this.entityType),
            resolve: this.mapper.createResolver<{ query: TQuery }, TEntity>({
                commandFactory: ({args}) => {
                    const query: any = {
                        ...(args.query || {}),
                        filters: args.query?.filters || {},
                    };

                    return options.commandFactory(query);
                },
                context: options.context
            }).rp
        });

        return this.getQueryResolver();
    }

    getQueryResolver() {
        return this.entityType.getResolver('query');
    }
}


export namespace EntityHelper {
    export type IDExtractor<TResult = any, TKey = ID> = (result: TResult) => TKey;
    export type ResultExtractor<TResult = any> = (result: any) => TResult[];

    export type FindByIdResolverOptions<TResult, TKey, TContextOptions, TDataLoaderContext> = {
        dataLoaderName?: string;
        commandFactory: (keys: TKey[], context: TDataLoaderContext) => Promise<Command> | Command;
        idExtractor?: IDExtractor<TResult, TKey>;
        resultHandler?: Mapper.ResultHandler<Mapper.ExecutionContext<TContextOptions, TDataLoaderContext>>;
        resultsExtractor?: ResultExtractor<TResult>;
    } & (TContextOptions extends undefined ? { context?: NonNullable<TContextOptions> } : { context: TContextOptions })

    export interface QueryResolverOptions<TQuery, TContext> extends QueryHelper.QueryOptions {
        commandFactory: (query: TQuery) => Promise<Command> | Command;
        context: TContext;
    }
}
