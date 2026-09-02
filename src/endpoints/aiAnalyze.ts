import { contentJson, OpenAPIRoute } from "chanfana";
import { AppContext } from "../types";
import { z } from "zod";

type OpenAIResponse = {
	id?: string;
	model?: string;
	output?: Array<{
		type?: string;
		content?: Array<{
			type?: string;
			text?: string;
			refusal?: string;
		}>;
	}>;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		total_tokens?: number;
	};
	error?: {
		message?: string;
		type?: string;
		code?: string | null;
	};
};

export class AiAnalyzeEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["AI"],
		summary: "Executa uma análise utilizando OpenAI",
		operationId: "ai-analyze",

		request: {
			headers: z.object({
				authorization: z
	.string()
	.nullish()
	.describe("Bearer token interno da SST Docs"),
			}),

			body: contentJson(
				z.object({
					prompt: z
						.string()
						.min(1)
						.max(50000)
						.describe("Conteúdo que será enviado para análise"),

					instructions: z
						.string()
						.max(20000)
						.optional()
						.describe(
							"Instruções adicionais para orientar a análise",
						),
				}),
			),
		},

		responses: {
			"200": {
				description: "Análise concluída com sucesso",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							response_id: z.string(),
							model: z.string(),
							output_text: z.string(),
						}),
					}),
				),
			},

			"401": {
				description: "Não autorizado",
			},
"500": {
	description: "Configuração interna inválida",
},
			"502": {
				description: "Erro na comunicação com a OpenAI",
			},
		},
	};

	public async handle(c: AppContext) {
		const data =
			await this.getValidatedData<typeof this.schema>();

		/*
		 * Segurança:
		 * somente a SST Docs poderá utilizar este endpoint.
		 */
		const authorization =
			c.req.header("Authorization") ??
			data.headers.authorization;

		const expectedAuthorization =
			`Bearer ${c.env.SST_INTERNAL_API_TOKEN}`;

		if (
			!authorization ||
			authorization !== expectedAuthorization
		) {
			return c.json(
				{
					success: false,
					error: "UNAUTHORIZED",
					message: "Token interno inválido ou ausente.",
				},
				401,
			);
		}

		/*
		 * Não permitimos que a chamada prossiga
		 * caso a chave da OpenAI não esteja configurada.
		 */
		if (!c.env.OPENAI_API_KEY) {
			return c.json(
				{
					success: false,
					error: "OPENAI_API_KEY_NOT_CONFIGURED",
					message:
						"A chave da OpenAI não está configurada no Worker.",
				},
				500,
			);
		}

		const defaultInstructions = `
Você é um mecanismo de análise técnica integrado à plataforma SST Docs.

Sua função é analisar rigorosamente o conteúdo recebido.

Regras obrigatórias:
- Não invente informações.
- Não presuma informações ausentes.
- Diferencie claramente fatos encontrados de inferências.
- Quando uma informação não estiver presente, informe explicitamente que não foi localizada.
- Preserve nomes, valores, datas, cargos, funções e demais dados encontrados no conteúdo.
- Analise todo o conteúdo fornecido antes de apresentar a resposta.
- Priorize precisão, rastreabilidade e consistência.
- Caso existam ambiguidades, registre-as claramente.
- Não substitua análise ou decisão humana.
`.trim();

		try {
			const openaiResponse = await fetch(
				"https://api.openai.com/v1/responses",
				{
					method: "POST",

					headers: {
						Authorization:
							`Bearer ${c.env.OPENAI_API_KEY}`,
						"Content-Type": "application/json",
					},

					body: JSON.stringify({
						model: "gpt-5.6-sol",

						reasoning: {
							effort: "max",
						},

						/*
						 * Importante para documentos SST/LGPD:
						 * não solicitar armazenamento da Response.
						 */
						store: false,

						instructions:
							data.body.instructions?.trim() ||
							defaultInstructions,

						input: data.body.prompt,
					}),
				},
			);

			const responseData =
				(await openaiResponse.json()) as OpenAIResponse;

			if (!openaiResponse.ok) {
				console.error(
					"OpenAI API error:",
					openaiResponse.status,
					responseData.error,
				);

				return c.json(
					{
						success: false,
						error: "OPENAI_API_ERROR",
						status: openaiResponse.status,
						message:
							responseData.error?.message ||
							"Erro ao executar análise na OpenAI.",
					},
					502,
				);
			}

			/*
			 * Na resposta HTTP bruta da Responses API,
			 * o texto fica dentro de output[].content[].
			 */
			const outputText =
				responseData.output
					?.flatMap(
						(item) => item.content ?? [],
					)
					.filter(
						(part) =>
							part.type === "output_text",
					)
					.map((part) => part.text ?? "")
					.join("\n")
					.trim() ?? "";

			if (!outputText) {
				return c.json(
					{
						success: false,
						error: "OPENAI_EMPTY_RESPONSE",
						message:
							"A OpenAI concluiu a solicitação, mas não retornou texto analisável.",
					},
					502,
				);
			}

			return {
				success: true,

				result: {
					response_id:
						responseData.id ?? "unknown",

					model:
						responseData.model ??
						"gpt-5.6-sol",

					output_text: outputText,
				},
			};
		} catch (error) {
			console.error(
				"Unexpected OpenAI integration error:",
				error,
			);

			return c.json(
				{
					success: false,
					error: "OPENAI_CONNECTION_ERROR",
					message:
						"Não foi possível concluir a comunicação com a OpenAI.",
				},
				502,
			);
		}
	}
}
