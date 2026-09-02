import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { tasksRouter } from "./endpoints/tasks/router";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { DummyEndpoint } from "./endpoints/dummyEndpoint";
import { AiAnalyzeEndpoint } from "./endpoints/aiAnalyze";
import type { Bindings } from "./types";

// Start a Hono app
const app = new Hono<{ Bindings: Bindings }>();

app.onError((err, c) => {
	if (err instanceof ApiException) {
		// If it's a Chanfana ApiException, let Chanfana handle the response
		return c.json(
			{ success: false, errors: err.buildResponse() },
			err.status as ContentfulStatusCode,
		);
	}

	console.error("Global error handler caught:", err);

	// For other errors, return a generic 500 response
	return c.json(
		{
			success: false,
			errors: [{ code: 7000, message: "Internal Server Error" }],
		},
		500,
	);
});

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
	schema: {
		info: {
			title: "SST Docs OpenAPI Backend",
			version: "1.0.0",
			description:
				"Backend OpenAPI da plataforma SST Docs para integrações e análise assistida por IA.",
		},
	},
});

// Register Tasks Sub router
openapi.route("/tasks", tasksRouter);

// Register example endpoint
openapi.post("/dummy/:slug", DummyEndpoint);

// Register SST Docs AI endpoint
openapi.post("/api/ai/analyze", AiAnalyzeEndpoint);

// Export the Hono app
export default app;
