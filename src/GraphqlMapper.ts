import {Either} from "monet";
import {AsyncOrSync, MarkOptional} from "ts-essentials";
import {ObjectTypeComposer, ResolverResolveParams} from "graphql-compose";
import * as is from 'predicates';
import {DataLoaderManager} from '@pallad/dataloader-manager';
import {GraphqlEntityHelper} from './GraphqlEntityHelper';
import {Command} from 'alpha-command-bus-core';

export class GraphqlMapper<TContext = any,
    TDataLoaderContext = any,
    TGQLContext extends GraphqlMapper.BasicGQLContext<TDataLoaderContext> = any> {

    static DEFAULT_OPTIONS = {
        resultHandler(result: Either<any, any>) {
            if (result.isLeft()) {
                throw result.left();
            }
            return result.right();
        },
    }

    private options: GraphqlMapper.Options;

    constructor(
        private commandBusHandler: GraphqlMapper.CommandBusHandler<GraphqlMapper.CommandBusHandler.Context<TContext, TGQLContext | TDataLoaderContext>>,
        private dataLoaderManager: DataLoaderManager,
        options: GraphqlMapper.Options.FromUser
    ) {
        this
            .options = {
            ...GraphqlMapper.DEFAULT_OPTIONS,
            ...options
        };
    }

    async handleCommand(command: Command,
                        context: TContext,
                        gqlContext: TGQLContext | TDataLoaderContext,
                        resultHandler?: GraphqlMapper.ResultHandler) {
        const finalResultHandler = resultHandler || this.options.resultHandler;

        const result = await Either.fromPromise(
            this.commandBusHandler(command, {
                context,
                gqlContext
            })
        );

        return finalResultHandler(result);
    }

    createResolver<TArgs = any, TSource = any>(
        options: GraphqlMapper.CreateResolverOptions<TContext, TGQLContext, TArgs, TSource>
    ): GraphqlMapper.Resolver<TArgs, TSource, TGQLContext> {
        const func = async (source: TSource, args: TArgs, context: TGQLContext) => {
            const data = {source, args, context};
            const command = await options.commandFactory(data);

            return this.handleCommand(command, options.context, context, options.resultHandler);
        }

        func.rp = (rp: ResolverResolveParams<TSource, TGQLContext, TArgs>) => {
            return func(rp.source, rp.args, rp.context);
        };

        return func;
    }

    createDataLoaderResolver(dataLoaderName: string, argKeyName?: string) {
        return (rp: ResolverResolveParams<any, TGQLContext>) => {
            if (!argKeyName && Object.keys(rp.args).length >= 2) {
                throw new Error(`Could not find key for dataloader: ${dataLoaderName}. No argKeyName provided and args have more than one values`);
            }

            const key = argKeyName ? rp.args[argKeyName] : rp.args[Object.keys(rp.args)[0]];
            if (is.empty(key)) {
                return;
            }
            return rp.context.dataLoaders.getDataLoader(dataLoaderName).load(key);
        }
    }

    createEntityHelper<TEntity = any>(entityType: ObjectTypeComposer<TEntity, TGQLContext>):
        GraphqlEntityHelper<TEntity, TGQLContext, TContext, TDataLoaderContext> {
        return new GraphqlEntityHelper(
            entityType,
            this,
            this.dataLoaderManager
        );
    }
}

export namespace GraphqlMapper {

    export type ResolverFunc<TArgs, TSource, TGQLContext> = (source: TSource, args: TArgs, context: TGQLContext) => Promise<any>

    export interface Resolver<TArgs, TSource, TGQLContext> extends ResolverFunc<TArgs, TSource, TGQLContext> {
        rp: (rp: ResolverResolveParams<TSource, TGQLContext, TArgs>) => Promise<any>
    }

    export interface BasicGQLContext<TDataLoaderContext = any> {
        dataLoaders: DataLoaderManager.Scope<TDataLoaderContext>
    }

    export type CommandBusHandler<TContext extends CommandBusHandler.Context<any, any>> = (command: Command, context: TContext) => Promise<any>;

    export namespace CommandBusHandler {
        export interface Context<TOptions, TCommonGQLContext> {
            context: TOptions;
            gqlContext: TCommonGQLContext;
        }
    }

    export interface Options {
        resultHandler: ResultHandler;
    }

    export namespace Options {
        export type FromUser = MarkOptional<Options, 'resultHandler'>;
    }

    export type ResultHandler = (result: Either<any, any>) => any | Promise<any>;

    export interface CreateResolverOptions<TCommandBusContext extends {},
        TGQLContext,
        TArgs extends Record<string, any>,
        TSource = any,
        > {
        commandFactory: (data: { args: TArgs, source: TSource, context: TGQLContext }) => AsyncOrSync<Command>,
        resultHandler?: ResultHandler;
        context: TCommandBusContext;
    }
}

