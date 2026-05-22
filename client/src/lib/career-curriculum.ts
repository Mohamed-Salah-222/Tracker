// =====================================================================
// AI Engineering Curriculum — 172 topics across 10 phases
// MERN → AI engineering transition · ~8 months full-time
// =====================================================================

export type CurriculumCategory = "Math" | "Python" | "ML" | "LLM APIs" | "RAG" | "Agents" | "Data" | "Deploy" | "Eval" | "Job prep";

export type CurriculumTopic = {
  id: string;
  number: number;
  title: string;
  category: CurriculumCategory;
  isProject?: boolean;
};

export type CurriculumPhase = {
  number: number;
  title: string;
  subtitle: string;
  topics: CurriculumTopic[];
};

export const CURRICULUM: CurriculumPhase[] = [
  {
    number: 1,
    title: "Math foundation",
    subtitle: "Months 1–2.5",
    topics: [
      { id: "scalar-vector-matrix", number: 1, title: "What is a scalar, vector, and matrix and why ML uses them", category: "Math" },
      { id: "vector-add-scalar-mul", number: 2, title: "Vector addition and scalar multiplication", category: "Math" },
      { id: "dot-product", number: 3, title: "The dot product what it measures geometrically", category: "Math" },
      { id: "matrix-multiplication", number: 4, title: "Matrix multiplication how and why", category: "Math" },
      { id: "transpose", number: 5, title: "Transpose of a matrix", category: "Math" },
      { id: "identity-inverse", number: 6, title: "Identity matrix and inverse matrix", category: "Math" },
      { id: "vector-norms", number: 7, title: "Vector norms (L1, L2) measuring distance", category: "Math" },
      { id: "vector-space-embeddings", number: 8, title: "What is a vector space and why embeddings live in one", category: "Math" },
      { id: "cosine-similarity", number: 9, title: "Cosine similarity the core of semantic search", category: "Math" },
      { id: "eigenvalues-eigenvectors", number: 10, title: "Eigenvalues and eigenvectors intuition before formulas", category: "Math" },
      { id: "svd", number: 11, title: "Singular Value Decomposition (SVD) and why it matters", category: "Math" },
      { id: "probability-basics", number: 12, title: "What is a probability sample spaces and events", category: "Math" },
      { id: "conditional-probability", number: 13, title: "Conditional probability P(A|B)", category: "Math" },
      { id: "bayes-theorem", number: 14, title: "Bayes' theorem how beliefs update with evidence", category: "Math" },
      { id: "probability-distributions", number: 15, title: "Probability distributions discrete vs continuous", category: "Math" },
      { id: "expectation", number: 16, title: 'Expectation what "average outcome" really means', category: "Math" },
      { id: "mean-variance-std", number: 17, title: "Mean, variance, and standard deviation", category: "Math" },
      { id: "normal-distribution", number: 18, title: "The normal (Gaussian) distribution", category: "Math" },
      { id: "log-probabilities", number: 19, title: "Log probabilities why ML uses them everywhere", category: "Math" },
      { id: "entropy-kl", number: 20, title: "Entropy and KL divergence comparing distributions", category: "Math" },
      { id: "softmax", number: 21, title: "The softmax function math and intuition", category: "Math" },
      { id: "what-is-function", number: 22, title: "What is a function inputs, outputs, composition", category: "Math" },
      { id: "derivative", number: 23, title: "What is a derivative rate of change, not formula", category: "Math" },
      { id: "chain-rule", number: 24, title: "The chain rule why backprop depends on it", category: "Math" },
      { id: "gradient", number: 25, title: "What is a gradient derivative in multiple dimensions", category: "Math" },
      { id: "gradient-descent-geometry", number: 26, title: "What gradient descent is doing geometrically", category: "Math" },
    ],
  },
  {
    number: 2,
    title: "Python & tooling",
    subtitle: "Month 2.5–3.5",
    topics: [
      { id: "python-vs-js", number: 27, title: "Python syntax vs JavaScript the key differences", category: "Python" },
      { id: "python-data-types", number: 28, title: "Python data types: lists, dicts, tuples, sets", category: "Python" },
      { id: "python-functions-args", number: 29, title: "Functions, *args, **kwargs", category: "Python" },
      { id: "list-comprehensions", number: 30, title: "List comprehensions and generator expressions", category: "Python" },
      { id: "python-classes", number: 31, title: "Classes and objects in Python", category: "Python" },
      { id: "python-file-io", number: 32, title: "Python file I/O reading and writing files", category: "Python" },
      { id: "python-errors", number: 33, title: "Python error handling try/except", category: "Python" },
      { id: "python-modules", number: 34, title: "Modules and packages import system", category: "Python" },
      { id: "venvs-pip", number: 35, title: "Virtual environments and pip", category: "Python" },
      { id: "type-hints", number: 36, title: "Type hints and why modern Python relies on them", category: "Python" },
      { id: "pydantic", number: 37, title: "Pydantic the backbone of modern LLM tooling", category: "Python" },
      { id: "asyncio", number: 38, title: "Asyncio fundamentals async/await without panic", category: "Python" },
      { id: "http-python", number: 39, title: "HTTP in Python requests vs httpx", category: "Python" },
      { id: "logging", number: 40, title: "Logging properly (not print statements)", category: "Python" },
      { id: "pytest", number: 41, title: "pytest basics writing your first tests", category: "Python" },
      { id: "numpy-arrays", number: 42, title: "NumPy arrays creation, indexing, slicing", category: "Python" },
      { id: "numpy-ops", number: 43, title: "NumPy operations broadcasting, dot, reshape", category: "Python" },
      { id: "pandas-basics", number: 44, title: "Pandas Series and DataFrame basics", category: "Python" },
      { id: "pandas-filter-group", number: 45, title: "Pandas filtering, groupby, apply", category: "Python" },
      { id: "jupyter", number: 46, title: "Jupyter notebooks when and how to use them", category: "Python" },
      { id: "matplotlib", number: 47, title: "Matplotlib basics plotting data you're working with", category: "Python" },
    ],
  },
  {
    number: 3,
    title: "ML fundamentals",
    subtitle: "Month 3.5–5",
    topics: [
      { id: "what-is-ml-model", number: 48, title: "What a machine learning model actually is", category: "ML" },
      { id: "training-vs-inference", number: 49, title: "Training vs inference what's happening in each", category: "ML" },
      { id: "dataset-features-labels", number: 50, title: "What a dataset is features, labels, splits", category: "ML" },
      { id: "train-val-test-split", number: 51, title: "Train/validation/test split discipline why and how", category: "ML" },
      { id: "supervised-unsupervised-self", number: 52, title: "Supervised vs unsupervised vs self-supervised learning", category: "ML" },
      { id: "loss-function", number: 53, title: "What a loss function is and what it measures", category: "ML" },
      { id: "cross-entropy", number: 54, title: "Cross-entropy loss the loss behind every LLM", category: "ML" },
      { id: "gradient-descent-minimise", number: 55, title: "How gradient descent minimises the loss", category: "ML" },
      { id: "neural-network", number: 56, title: "What a neural network is layers, neurons, weights", category: "ML" },
      { id: "activations", number: 57, title: "Activation functions ReLU, sigmoid, softmax", category: "ML" },
      { id: "backpropagation", number: 58, title: "What backpropagation is doing (conceptual)", category: "ML" },
      { id: "overfitting", number: 59, title: "Overfitting and underfitting and how to detect them", category: "ML" },
      { id: "regularisation", number: 60, title: "Regularisation dropout and weight decay", category: "ML" },
      { id: "eval-metrics-pr", number: 61, title: "Evaluation metrics: accuracy, precision, recall, F1", category: "ML" },
      { id: "roc-auc", number: 62, title: "ROC curves and AUC when accuracy lies", category: "ML" },
      { id: "perplexity", number: 63, title: "Perplexity the metric for language models", category: "ML" },
      { id: "wandb", number: 64, title: "Experiment tracking with Weights & Biases", category: "ML" },
      { id: "project-image-classifier", number: 65, title: "PROJECT: Train a small image classifier end-to-end", category: "ML", isProject: true },
      { id: "tokenisation", number: 66, title: "What tokenisation is turning text into numbers", category: "ML" },
      { id: "embeddings", number: 67, title: "What embeddings are words as vectors in space", category: "ML" },
      { id: "attention", number: 68, title: "The attention mechanism what it computes", category: "ML" },
      { id: "transformer", number: 69, title: "The transformer architecture conceptual walkthrough", category: "ML" },
      { id: "pretrained-model", number: 70, title: "What a pretrained model is and what pretraining means", category: "ML" },
      { id: "finetuning", number: 71, title: "What fine-tuning is vs training from scratch", category: "ML" },
      { id: "huggingface-hub", number: 72, title: "HuggingFace Hub finding and loading models", category: "ML" },
      { id: "huggingface-pipeline", number: 73, title: "Running inference with a HuggingFace pipeline", category: "ML" },
      { id: "foundation-models", number: 74, title: "What a foundation model / LLM is GPT, Claude, Llama", category: "ML" },
    ],
  },
  {
    number: 4,
    title: "LLM APIs & prompt engineering",
    subtitle: "Month 5–6",
    topics: [
      { id: "llm-api-basics", number: 75, title: "How LLM APIs work requests, responses, tokens", category: "LLM APIs" },
      { id: "anthropic-api", number: 76, title: "The Anthropic API setup, authentication, first call", category: "LLM APIs" },
      { id: "openai-api", number: 77, title: "The OpenAI API setup and first call", category: "LLM APIs" },
      { id: "system-vs-user-prompts", number: 78, title: "System prompts vs user prompts roles explained", category: "LLM APIs" },
      { id: "temperature-top-p", number: 79, title: "What temperature and top-p control", category: "LLM APIs" },
      { id: "token-limits", number: 80, title: "Token limits context windows and why they matter", category: "LLM APIs" },
      { id: "counting-tokens", number: 81, title: "Counting tokens tiktoken and cost estimation", category: "LLM APIs" },
      { id: "async-llm-calls", number: 82, title: "Async LLM calls and parallel requests", category: "LLM APIs" },
      { id: "retry-backoff", number: 83, title: "Retry logic and exponential backoff", category: "LLM APIs" },
      { id: "response-caching", number: 84, title: "Response caching when and how", category: "LLM APIs" },
      { id: "zero-shot", number: 85, title: "Zero-shot prompting", category: "LLM APIs" },
      { id: "few-shot", number: 86, title: "Few-shot prompting examples in the prompt", category: "LLM APIs" },
      { id: "chain-of-thought", number: 87, title: "Chain-of-thought prompting", category: "LLM APIs" },
      { id: "prompt-injection", number: 88, title: "Prompt injection what it is and why it's a risk", category: "LLM APIs" },
      { id: "structured-outputs-pydantic", number: 89, title: "Structured outputs with Pydantic reliable JSON", category: "LLM APIs" },
      { id: "streaming", number: 90, title: "Streaming responses why and how", category: "LLM APIs" },
      { id: "multi-turn", number: 91, title: "Multi-turn conversations managing message history", category: "LLM APIs" },
      { id: "hallucination", number: 92, title: "Hallucination why it happens and how to reduce it", category: "LLM APIs" },
      { id: "grounding", number: 93, title: "Grounding keeping model answers anchored to facts", category: "LLM APIs" },
      { id: "evaluating-prompts", number: 94, title: "Evaluating prompts systematically", category: "LLM APIs" },
      { id: "comparing-models", number: 95, title: "Comparing models when to use GPT vs Claude vs Llama", category: "LLM APIs" },
      { id: "cost-optimisation", number: 96, title: "Cost optimisation batching, caching, model selection", category: "LLM APIs" },
    ],
  },
  {
    number: 5,
    title: "RAG systems",
    subtitle: "Month 6–7.5",
    topics: [
      { id: "what-is-rag", number: 97, title: "What RAG is and the problem it solves", category: "RAG" },
      { id: "rag-pipeline", number: 98, title: "The RAG pipeline all 5 stages end to end", category: "RAG" },
      { id: "document-loading", number: 99, title: "Document loading PDFs, text files, web pages", category: "RAG" },
      { id: "chunking", number: 100, title: "Text chunking strategies fixed, recursive, semantic", category: "RAG" },
      { id: "chunking-overlap", number: 101, title: "Chunking overlap and why it matters", category: "RAG" },
      { id: "generating-embeddings", number: 102, title: "Generating embeddings from text chunks", category: "RAG" },
      { id: "vector-database", number: 103, title: "What a vector database is and how it stores embeddings", category: "RAG" },
      { id: "pinecone", number: 104, title: "Pinecone setup, upsert, query", category: "RAG" },
      { id: "semantic-search", number: 105, title: "Semantic search embedding a query and finding nearest chunks", category: "RAG" },
      { id: "top-k-retrieval", number: 106, title: "Top-k retrieval choosing how many chunks to retrieve", category: "RAG" },
      { id: "retrieval-prompt", number: 107, title: "The retrieval + generation prompt assembling context", category: "RAG" },
      { id: "hybrid-search", number: 108, title: "Hybrid search combining semantic and keyword (BM25)", category: "RAG" },
      { id: "reranking", number: 109, title: "Reranking improving retrieval with a second model", category: "RAG" },
      { id: "metadata-filtering", number: 110, title: "Metadata filtering narrowing retrieval with structured filters", category: "RAG" },
      { id: "query-rewriting-hyde", number: 111, title: "Query rewriting and HyDE improving the question first", category: "RAG" },
      { id: "parent-document-retrieval", number: 112, title: "Parent-document retrieval small chunks, big context", category: "RAG" },
      { id: "rag-evaluation", number: 113, title: "Evaluating RAG quality precision, recall, faithfulness", category: "RAG" },
      { id: "ragas", number: 114, title: "RAG evaluation with Ragas the standard framework", category: "RAG" },
      { id: "llamaindex", number: 115, title: "LlamaIndex core abstractions and when to use it", category: "RAG" },
      { id: "langchain", number: 116, title: "LangChain core abstractions and when to use it", category: "RAG" },
      { id: "project-rag-app", number: 117, title: "PROJECT: Build a full RAG app (PDF Q&A) end to end", category: "RAG", isProject: true },
      { id: "production-rag-patterns", number: 118, title: "Production RAG patterns and common failure modes", category: "RAG" },
    ],
  },
  {
    number: 6,
    title: "AI agents",
    subtitle: "Month 7.5–9",
    topics: [
      { id: "what-is-agent", number: 119, title: "What an AI agent is beyond single-turn completions", category: "Agents" },
      { id: "agent-loop", number: 120, title: "The agent loop observe, think, act, repeat", category: "Agents" },
      { id: "tool-use-function-calling", number: 121, title: "Tool use / function calling giving the model tools", category: "Agents" },
      { id: "defining-tools", number: 122, title: "Defining tools schemas, descriptions, parameters", category: "Agents" },
      { id: "parsing-tool-calls", number: 123, title: "Parsing tool calls from model output", category: "Agents" },
      { id: "executing-tools", number: 124, title: "Executing tools and feeding results back to the model", category: "Agents" },
      { id: "mcp", number: 125, title: "MCP (Model Context Protocol) the new standard", category: "Agents" },
      { id: "web-search-tool", number: 126, title: "Web search as a tool SerpAPI, Tavily", category: "Agents" },
      { id: "code-execution-tool", number: 127, title: "Code execution as a tool", category: "Agents" },
      { id: "agent-memory", number: 128, title: "Agent memory short-term vs long-term", category: "Agents" },
      { id: "conversation-memory", number: 129, title: "Conversation memory summarisation strategies", category: "Agents" },
      { id: "react-pattern", number: 130, title: "Multi-step reasoning ReAct pattern", category: "Agents" },
      { id: "planning-agents", number: 131, title: "Planning agents breaking a goal into subtasks", category: "Agents" },
      { id: "multi-agent-orchestration", number: 132, title: "Multi-agent orchestration patterns", category: "Agents" },
      { id: "agent-failures", number: 133, title: "When agents fail infinite loops, hallucinated tool calls", category: "Agents" },
      { id: "agent-safety", number: 134, title: "Safety in agents guardrails and stopping conditions", category: "Agents" },
      { id: "agent-evaluation", number: 135, title: "Agent evaluation the hardest problem in the field", category: "Agents" },
      { id: "agent-frameworks-when-not", number: 136, title: "Agent frameworks and when NOT to use them", category: "Agents" },
      { id: "project-research-agent", number: 137, title: "PROJECT: Build a research agent end to end", category: "Agents", isProject: true },
    ],
  },
  {
    number: 7,
    title: "Data & SQL",
    subtitle: "Month 9–9.5",
    topics: [
      { id: "sql-fundamentals", number: 138, title: "SQL fundamentals SELECT, WHERE, ORDER BY", category: "Data" },
      { id: "sql-joins", number: 139, title: "SQL joins INNER, LEFT, RIGHT, FULL", category: "Data" },
      { id: "sql-aggregations", number: 140, title: "SQL aggregations GROUP BY, HAVING, window functions", category: "Data" },
      { id: "postgres-for-ai", number: 141, title: "Working with Postgres for AI applications", category: "Data" },
      { id: "pgvector", number: 142, title: "pgvector storing embeddings in Postgres", category: "Data" },
      { id: "etl-patterns", number: 143, title: "Basic ETL patterns extract, transform, load", category: "Data" },
      { id: "data-versioning-dvc", number: 144, title: "Data versioning DVC and why it matters", category: "Data" },
      { id: "sqlalchemy", number: 145, title: "Connecting Python to databases SQLAlchemy basics", category: "Data" },
    ],
  },
  {
    number: 8,
    title: "Production & deployment",
    subtitle: "Month 9.5–11",
    topics: [
      { id: "fastapi", number: 146, title: "FastAPI wrapping AI logic in an API", category: "Deploy" },
      { id: "async-fastapi", number: 147, title: "Async FastAPI properly handling LLM latency", category: "Deploy" },
      { id: "env-secrets", number: 148, title: "Environment variables and secret management", category: "Deploy" },
      { id: "docker", number: 149, title: "Docker containerising your AI app", category: "Deploy" },
      { id: "deploy-render", number: 150, title: "Deploying to Render or Railway free tier workflow", category: "Deploy" },
      { id: "llm-observability", number: 151, title: "LLM observability with Langfuse or LangSmith", category: "Deploy" },
      { id: "prompt-versioning", number: 152, title: "Prompt versioning and management in production", category: "Deploy" },
      { id: "ab-testing-prompts", number: 153, title: "A/B testing prompts and models", category: "Deploy" },
      { id: "eval-pipelines-prod", number: 154, title: "Eval pipelines running in production", category: "Deploy" },
      { id: "pii-safety", number: 155, title: "PII detection and safety filtering", category: "Deploy" },
      { id: "logging-monitoring", number: 156, title: "Logging and monitoring AI responses in production", category: "Deploy" },
      { id: "rate-limiting", number: 157, title: "Rate limiting and cost controls on your API", category: "Deploy" },
      { id: "caching-strategies", number: 158, title: "Caching strategies semantic and exact-match", category: "Deploy" },
      { id: "vector-db-scaling", number: 159, title: "Vector DB scaling and hosting considerations", category: "Deploy" },
      { id: "nextjs-fastapi", number: 160, title: "Connecting your Next.js frontend to a FastAPI backend", category: "Deploy" },
      { id: "incident-response", number: 161, title: "Incident response when your AI app breaks at 3am", category: "Deploy" },
    ],
  },
  {
    number: 9,
    title: "Evaluation",
    subtitle: "Month 11–11.5",
    topics: [
      { id: "offline-evals", number: 162, title: "Offline evals building your golden dataset", category: "Eval" },
      { id: "online-evals", number: 163, title: "Online evals measuring real user interactions", category: "Eval" },
      { id: "llm-as-judge", number: 164, title: "LLM-as-judge the technique and its pitfalls", category: "Eval" },
      { id: "eval-datasets", number: 165, title: "Eval datasets curation and maintenance", category: "Eval" },
      { id: "regression-testing", number: 166, title: "Regression testing for prompts and models", category: "Eval" },
      { id: "human-in-the-loop", number: 167, title: "Human-in-the-loop evaluation workflows", category: "Eval" },
    ],
  },
  {
    number: 10,
    title: "Job prep & portfolio",
    subtitle: "Month 11.5–12",
    topics: [
      { id: "framing-mern-background", number: 168, title: "How to frame your MERN background as an AI engineering asset", category: "Job prep" },
      { id: "portfolio-rag-app", number: 169, title: "PORTFOLIO PROJECT 1: Production RAG app with full eval suite", category: "Job prep", isProject: true },
      { id: "portfolio-multi-tool-agent", number: 170, title: "PORTFOLIO PROJECT 2: Multi-tool agent with observability", category: "Job prep", isProject: true },
      { id: "portfolio-finetuned-model", number: 171, title: "PORTFOLIO PROJECT 3: Fine-tuned model deployed to production", category: "Job prep", isProject: true },
      { id: "ai-interview-format", number: 172, title: "What AI engineering interviews actually look like", category: "Job prep" },
      { id: "system-design-ai", number: 173, title: "System design for AI systems how to answer design questions", category: "Job prep" },
      { id: "take-home-patterns", number: 174, title: "Take-home assignment patterns what they actually test", category: "Job prep" },
      { id: "tradeoffs-senior-signal", number: 175, title: "Talking about tradeoffs the senior-engineer signal", category: "Job prep" },
      { id: "explaining-rag-agents", number: 176, title: "Explaining RAG, agents, and embeddings out loud (interview practice)", category: "Job prep" },
      { id: "negotiation", number: 177, title: "Negotiation basics for AI engineering offers", category: "Job prep" },
    ],
  },
];

// Flat list of all topics, useful for lookup
export const ALL_TOPICS: CurriculumTopic[] = CURRICULUM.flatMap((p) => p.topics);

export const TOPIC_BY_ID: Record<string, CurriculumTopic> = Object.fromEntries(ALL_TOPICS.map((t) => [t.id, t]));

export const TOTAL_TOPICS = ALL_TOPICS.length;

// Phase of a topic by id
export const PHASE_BY_TOPIC_ID: Record<string, CurriculumPhase> = (() => {
  const m: Record<string, CurriculumPhase> = {};
  for (const phase of CURRICULUM) {
    for (const topic of phase.topics) {
      m[topic.id] = phase;
    }
  }
  return m;
})();

// Category colors — semantic tokens (must be added to index.css)
export const CATEGORY_COLOR: Record<CurriculumCategory, string> = {
  Math: "var(--color-career-math)",
  Python: "var(--color-career-python)",
  ML: "var(--color-career-ml)",
  "LLM APIs": "var(--color-career-llm)",
  RAG: "var(--color-career-rag)",
  Agents: "var(--color-career-agents)",
  Data: "var(--color-career-data)",
  Deploy: "var(--color-career-deploy)",
  Eval: "var(--color-career-eval)",
  "Job prep": "var(--color-career-job)",
};

export const CATEGORY_BG: Record<CurriculumCategory, string> = {
  Math: "var(--color-career-math-bg)",
  Python: "var(--color-career-python-bg)",
  ML: "var(--color-career-ml-bg)",
  "LLM APIs": "var(--color-career-llm-bg)",
  RAG: "var(--color-career-rag-bg)",
  Agents: "var(--color-career-agents-bg)",
  Data: "var(--color-career-data-bg)",
  Deploy: "var(--color-career-deploy-bg)",
  Eval: "var(--color-career-eval-bg)",
  "Job prep": "var(--color-career-job-bg)",
};
