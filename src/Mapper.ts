import {Either, Validation} from "monet";
import {ObjectTypeComposer, ResolverResolveParams} from "graphql-compose";
import * as is from 'predicates';
import {DataLoaderManager} from '@pallad/dataloader-manager';
import {EntityHelper} from './EntityHelper';
import {Command, CommandRunner} from 'alpha-command-bus-core';

export class Mapper<TContextOptions = any,
    TDataLoaderContext = any,
    TGQLContext extends Mapper.BasicGQLContext<TDataLoaderContext> = any> {

    constructor(
        private commandBusHandler: CommandRunner<any, Mapper.ExecutionContext<TContextOptions, TGQLContext | TDataLoaderContext>>,
        private dataLoaderManager: DataLoaderManager,
    ) {

    }

    async handleCommand<TExecutionContext extends Mapper.ExecutionContext<any, any>>(command: Command,
                                                                                     executionContext: TExecutionContext,
                                                                                     resultHandler?: Mapper.ResultHandler<TExecutionContext>) {
        const result = (await Either.fromPromise(
            this.commandBusHandler(command, executionContext)
        )).toValidation();

        const finalResult = resultHandler ? await resultHandler(result, executionContext) : result;

        if (finalResult.isFail()) {
            throw finalResult.fail();
        }
        return finalResult.success();
    }

    createResolver<TArgs = any, TSource = any>(
        options: Mapper.CreateResolverOptions<TContextOptions, TGQLContext, TArgs, TSource>
    ): Mapper.Resolver<TArgs, TSource, TGQLContext> {
        const func = async (source: TSource, args: TArgs, context: TGQLContext) => {
            const data = {source, args, context};
            const command = await options.commandFactory(data);

            const executionContext: Mapper.ExecutionContext<TContextOptions, TGQLContext> = {
                contextOptions: options.context!,
                gqlContext: context
            }
            return this.handleCommand(command, executionContext, options.resultHandler);
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
        EntityHelper<TEntity, TContextOptions, TDataLoaderContext> {
        return new EntityHelper(
            entityType,
            this,
            this.dataLoaderManager
        );
    }
}

export namespace Mapper {
    export interface ExecutionContext<TContextOptions, TGQLContext> {
        contextOptions: TContextOptions;
        gqlContext: TGQLContext;
    }

    export type ResolverFunc<TArgs, TSource, TGQLContext> = (source: TSource, args: TArgs, context: TGQLContext) => Promise<any>

    export interface Resolver<TArgs, TSource, TGQLContext> extends ResolverFunc<TArgs, TSource, TGQLContext> {
        rp: (rp: ResolverResolveParams<TSource, TGQLContext, TArgs>) => Promise<any>
    }

    export interface BasicGQLContext<TDataLoaderContext = any> {
        dataLoaders: DataLoaderManager.Scope<TDataLoaderContext>
    }

    export type ResultHandler<TExecutionContext> = (result: Validation<any, any>, executionContext: TExecutionContext) => Validation<any, any> | Promise<Validation<any, any>>;

    export type CreateResolverOptions<TContextOptions,
        TGQLContext,
        TArgs extends Record<string, any>,
        TSource = any,
        > = {
        commandFactory: (data: { args: TArgs, source: TSource, context: TGQLContext }) => Promise<Command> | Command,
        resultHandler?: ResultHandler<ExecutionContext<TContextOptions, TGQLContext>>;
    } & (TContextOptions extends undefined ? { context?: NonNullable<TContextOptions> } : { context: TContextOptions })
}


const mapper = new Mapper<{ test: string } | undefined>({} as any, {} as any);

mapper.createResolver({
    commandFactory() {
        return {} as any;
    }
})