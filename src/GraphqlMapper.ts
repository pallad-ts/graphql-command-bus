import {Client, Command} from "alpha-command-bus-rpc-client";
import {Either} from "monet";
import {AsyncOrSync, MarkOptional} from "ts-essentials";
import CreateResolverOptions = GraphqlMapper.CreateResolverOptions;
import {ResolverResolveParams} from "graphql-compose";

export class GraphqlMapper<TCommandBusContext extends {} = any,
    TGQLContext = any> {

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
        private commandBusHandler: GraphqlMapper.CommandBusHandler<GraphqlMapper.CommandBusHandler.Context<TCommandBusContext, TGQLContext>>,
        options: GraphqlMapper.Options.FromUser
    ) {
        this
            .options = {
            ...GraphqlMapper.DEFAULT_OPTIONS,
            ...options
        };
    }

    createResolver<TArgs = any, TSource = any>(
        options: CreateResolverOptions<TCommandBusContext, TGQLContext, TArgs, TSource>
    ) {
        return async (source: TSource, args: TArgs, context: TGQLContext) => {
            const data = {source, args, context};
            const command = await options.commandFactory(data);

            const resultHandler = options.resultHandler || this.options.resultHandler;

            const result = await Either.fromPromise(
                this.commandBusHandler(command, {
                    context: options.context,
                    gqlContext: context
                })
            );

            return resultHandler(result);
        }
    }

    createResolverAsRP<TArgs = any, TSource = any>(options: CreateResolverOptions<TCommandBusContext, TGQLContext, TArgs, TSource>) {
        const resolver = this.createResolver(options);
        return (rp: ResolverResolveParams<TSource, TGQLContext, TArgs>) => {
            return resolver(rp.source, rp.args, rp.context);
        }
    }
}

export namespace GraphqlMapper {
    export type CommandBusHandler<TContext extends CommandBusHandler.Context<any, any>> = (command: Command, context: TContext) => Promise<any>;

    export namespace CommandBusHandler {
        export interface Context<TOptions, TGQLContext> {
            context: TOptions;
            gqlContext: TGQLContext;
        }
    }

    export interface Options {
        resultHandler: ResultHandler;
    }

    export namespace Options {
        export type FromUser = MarkOptional<Options, 'resultHandler'>;
    }

    export type ResultHandler = (result: Either<any, any>) => any | Promise<any>;
    export type CommandFactory<TArgs extends Record<string, any>,
        TSource = any,
        TGQLContext = any> = (data: { args: TArgs, source: TSource, context: TGQLContext }) => AsyncOrSync<Command>;

    export interface CreateResolverOptions<TCommandBusContext extends {},
        TGQLContext,
        TArgs extends Record<string, any>,
        TSource = any,
        > {
        commandFactory: CommandFactory<TArgs, TSource, TGQLContext>,
        resultHandler?: ResultHandler;
        context: TCommandBusContext;
    }

}

