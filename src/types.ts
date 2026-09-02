import type { Context } from "hono";

export type Bindings = Env & {
	OPENAI_API_KEY: string;
	SST_INTERNAL_API_TOKEN: string;
};

export type AppContext = Context<{ Bindings: Bindings }>;
export type HandleArgs = [AppContext];
