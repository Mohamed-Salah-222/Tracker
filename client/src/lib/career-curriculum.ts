// =====================================================================
// AI Engineering Curriculum — 120 topics across 8 phases
// =====================================================================

export type CurriculumCategory = "Math" | "Python" | "ML" | "LLM APIs" | "RAG" | "Agents" | "Deploy" | "Job prep";

export type CurriculumTopic = {
  id: string;
  number: number;
  title: string;
  category: CurriculumCategory;
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
    subtitle: "Months 1–2",
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
      { id: "probability-basics", number: 10, title: "What is a probability sample spaces and events", category: "Math" },
      { id: "conditional-probability", number: 11, title: "Conditional probability P(A|B)", category: "Math" },
      { id: "bayes-theorem", number: 12, title: "Bayes' theorem how beliefs update with evidence", category: "Math" },
      { id: "probability-distributions", number: 13, title: "Probability distributions discrete vs continuous", category: "Math" },
      { id: "mean-variance-std", number: 14, title: "Mean, variance, and standard deviation", category: "Math" },
      { id: "normal-distribution", number: 15, title: "The normal (Gaussian) distribution", category: "Math" },
      { id: "what-is-function", number: 16, title: "What is a function inputs, outputs, composition", category: "Math" },
      { id: "derivative", number: 17, title: "What is a derivative rate of change, not formula", category: "Math" },
      { id: "chain-rule", number: 18, title: "The chain rule why backprop depends on it", category: "Math" },
      { id: "gradient", number: 19, title: "What is a gradient derivative in multiple dimensions", category: "Math" },
      { id: "gradient-descent-geometry", number: 20, title: "What gradient descent is doing geometrically", category: "Math" },
    ],
  },
  {
    number: 2,
    title: "Python & tooling",
    subtitle: "Month 2–3",
    topics: [
      { id: "python-vs-js", number: 21, title: "Python syntax vs JavaScript the key differences", category: "Python" },
      { id: "python-data-types", number: 22, title: "Python data types: lists, dicts, tuples, sets", category: "Python" },
      { id: "python-functions-args", number: 23, title: "Functions, *args, **kwargs", category: "Python" },
      { id: "list-comprehensions", number: 24, title: "List comprehensions and generator expressions", category: "Python" },
      { id: "python-classes", number: 25, title: "Classes and objects in Python", category: "Python" },
      { id: "python-file-io", number: 26, title: "Python file I/O reading and writing files", category: "Python" },
      { id: "python-errors", number: 27, title: "Python error handling try/except", category: "Python" },
      { id: "python-modules", number: 28, title: "Modules and packages import system", category: "Python" },
      { id: "venvs-pip", number: 29, title: "Virtual environments and pip", category: "Python" },
      { id: "numpy-arrays", number: 30, title: "NumPy arrays creation, indexing, slicing", category: "Python" },
      { id: "numpy-ops", number: 31, title: "NumPy operations broadcasting, dot, reshape", category: "Python" },
      { id: "pandas-basics", number: 32, title: "Pandas Series and DataFrame basics", category: "Python" },
      { id: "pandas-filter-group", number: 33, title: "Pandas filtering, groupby, apply", category: "Python" },
      { id: "jupyter", number: 34, title: "Jupyter notebooks when and how to use them", category: "Python" },
      { id: "matplotlib", number: 35, title: "Matplotlib basics plotting data you're working with", category: "Python" },
    ],
  },
  {
    number: 3,
    title: "ML fundamentals",
    subtitle: "Month 3–4",
    topics: [
      { id: "what-is-ml-model", number: 36, title: "What a machine learning model actually is", category: "ML" },
      { id: "training-vs-inference", number: 37, title: "Training vs inference what's happening in each", category: "ML" },
      { id: "dataset-features-labels", number: 38, title: "What a dataset is features, labels, splits", category: "ML" },
      { id: "supervised-unsupervised-self", number: 39, title: "Supervised vs unsupervised vs self-supervised learning", category: "ML" },
      { id: "loss-function", number: 40, title: "What a loss function is and what it measures", category: "ML" },
      { id: "gradient-descent-minimise", number: 41, title: "How gradient descent minimises the loss", category: "ML" },
      { id: "neural-network", number: 42, title: "What a neural network is layers, neurons, weights", category: "ML" },
      { id: "activations", number: 43, title: "Activation functions ReLU, sigmoid, softmax", category: "ML" },
      { id: "backpropagation", number: 44, title: "What backpropagation is doing (conceptual)", category: "ML" },
      { id: "overfitting", number: 45, title: "Overfitting and underfitting and how to detect them", category: "ML" },
      { id: "regularisation", number: 46, title: "Regularisation dropout and weight decay", category: "ML" },
      { id: "tokenisation", number: 47, title: "What tokenisation is turning text into numbers", category: "ML" },
      { id: "embeddings", number: 48, title: "What embeddings are words as vectors in space", category: "ML" },
      { id: "attention", number: 49, title: "The attention mechanism what it computes", category: "ML" },
      { id: "transformer", number: 50, title: "The transformer architecture conceptual walkthrough", category: "ML" },
      { id: "pretrained-model", number: 51, title: "What a pretrained model is and what pretraining means", category: "ML" },
      { id: "finetuning", number: 52, title: "What fine-tuning is vs training from scratch", category: "ML" },
      { id: "huggingface-hub", number: 53, title: "HuggingFace Hub finding and loading models", category: "ML" },
      { id: "huggingface-pipeline", number: 54, title: "Running inference with a HuggingFace pipeline", category: "ML" },
      { id: "foundation-models", number: 55, title: "What a foundation model / LLM is GPT, Claude, Llama", category: "ML" },
    ],
  },
  {
    number: 4,
    title: "LLM APIs & prompt engineering",
    subtitle: "Month 4–5",
    topics: [
      { id: "llm-api-basics", number: 56, title: "How LLM APIs work requests, responses, tokens", category: "LLM APIs" },
      { id: "anthropic-api", number: 57, title: "The Anthropic API setup, authentication, first call", category: "LLM APIs" },
      { id: "openai-api", number: 58, title: "The OpenAI API setup and first call", category: "LLM APIs" },
      { id: "system-vs-user-prompts", number: 59, title: "System prompts vs user prompts roles explained", category: "LLM APIs" },
      { id: "temperature-top-p", number: 60, title: "What temperature and top-p control", category: "LLM APIs" },
      { id: "token-limits", number: 61, title: "Token limits context windows and why they matter", category: "LLM APIs" },
      { id: "counting-tokens", number: 62, title: "Counting tokens tiktoken and cost estimation", category: "LLM APIs" },
      { id: "zero-shot", number: 63, title: "Zero-shot prompting", category: "LLM APIs" },
      { id: "few-shot", number: 64, title: "Few-shot prompting examples in the prompt", category: "LLM APIs" },
      { id: "chain-of-thought", number: 65, title: "Chain-of-thought prompting", category: "LLM APIs" },
      { id: "prompt-injection", number: 66, title: "Prompt injection what it is and why it's a risk", category: "LLM APIs" },
      { id: "structured-outputs", number: 67, title: "Structured outputs getting JSON from a model reliably", category: "LLM APIs" },
      { id: "streaming", number: 68, title: "Streaming responses why and how", category: "LLM APIs" },
      { id: "multi-turn", number: 69, title: "Multi-turn conversations managing message history", category: "LLM APIs" },
      { id: "hallucination", number: 70, title: "Hallucination why it happens and how to reduce it", category: "LLM APIs" },
      { id: "grounding", number: 71, title: "Grounding keeping model answers anchored to facts", category: "LLM APIs" },
      { id: "comparing-models", number: 72, title: "Comparing models when to use GPT-4o vs Claude vs Llama", category: "LLM APIs" },
      { id: "cost-optimisation", number: 73, title: "Cost optimisation batching, caching, model selection", category: "LLM APIs" },
    ],
  },
  {
    number: 5,
    title: "RAG systems",
    subtitle: "Month 5–6",
    topics: [
      { id: "what-is-rag", number: 74, title: "What RAG is and the problem it solves", category: "RAG" },
      { id: "rag-pipeline", number: 75, title: "The RAG pipeline all 5 stages end to end", category: "RAG" },
      { id: "document-loading", number: 76, title: "Document loading PDFs, text files, web pages", category: "RAG" },
      { id: "chunking", number: 77, title: "Text chunking strategies fixed, recursive, semantic", category: "RAG" },
      { id: "generating-embeddings", number: 78, title: "Generating embeddings from text chunks", category: "RAG" },
      { id: "vector-database", number: 79, title: "What a vector database is and how it stores embeddings", category: "RAG" },
      { id: "pinecone", number: 80, title: "Pinecone setup, upsert, query", category: "RAG" },
      { id: "weaviate", number: 81, title: "Weaviate as an alternative to Pinecone", category: "RAG" },
      { id: "semantic-search", number: 82, title: "Semantic search embedding a query and finding nearest chunks", category: "RAG" },
      { id: "top-k-retrieval", number: 83, title: "Top-k retrieval choosing how many chunks to retrieve", category: "RAG" },
      { id: "retrieval-prompt", number: 84, title: "The retrieval + generation prompt assembling context", category: "RAG" },
      { id: "rag-evaluation", number: 85, title: "Evaluating RAG quality precision, recall, faithfulness", category: "RAG" },
      { id: "hybrid-search", number: 86, title: "Hybrid search combining semantic and keyword (BM25)", category: "RAG" },
      { id: "reranking", number: 87, title: "Reranking improving retrieval with a second model", category: "RAG" },
      { id: "metadata-filtering", number: 88, title: "Metadata filtering narrowing retrieval with structured filters", category: "RAG" },
      { id: "chunking-overlap", number: 89, title: "Chunking overlap and why it matters", category: "RAG" },
      { id: "llamaindex", number: 90, title: "LlamaIndex core abstractions and when to use it", category: "RAG" },
      { id: "langchain", number: 91, title: "LangChain core abstractions and when to use it", category: "RAG" },
      { id: "full-rag-app", number: 92, title: "Building a full RAG app (PDF Q&A) end to end", category: "RAG" },
      { id: "rag-failure-modes", number: 93, title: "Common RAG failure modes and how to debug them", category: "RAG" },
    ],
  },
  {
    number: 6,
    title: "AI agents",
    subtitle: "Month 6–7",
    topics: [
      { id: "what-is-agent", number: 94, title: "What an AI agent is beyond single-turn completions", category: "Agents" },
      { id: "agent-loop", number: 95, title: "The agent loop observe, think, act, repeat", category: "Agents" },
      { id: "tool-use-function-calling", number: 96, title: "Tool use / function calling giving the model tools", category: "Agents" },
      { id: "defining-tools", number: 97, title: "Defining tools schemas, descriptions, parameters", category: "Agents" },
      { id: "parsing-tool-calls", number: 98, title: "Parsing tool calls from model output", category: "Agents" },
      { id: "executing-tools", number: 99, title: "Executing tools and feeding results back to the model", category: "Agents" },
      { id: "web-search-tool", number: 100, title: "Web search as a tool SerpAPI, Tavily", category: "Agents" },
      { id: "code-execution-tool", number: 101, title: "Code execution as a tool", category: "Agents" },
      { id: "agent-memory", number: 102, title: "Agent memory short-term vs long-term", category: "Agents" },
      { id: "conversation-memory", number: 103, title: "Conversation memory summarisation strategies", category: "Agents" },
      { id: "react-pattern", number: 104, title: "Multi-step reasoning ReAct pattern", category: "Agents" },
      { id: "planning-agents", number: 105, title: "Planning agents breaking a goal into subtasks", category: "Agents" },
      { id: "agent-failures", number: 106, title: "When agents fail infinite loops, hallucinated tool calls", category: "Agents" },
      { id: "agent-safety", number: 107, title: "Safety in agents guardrails and stopping conditions", category: "Agents" },
      { id: "research-agent", number: 108, title: "Building a research agent end to end", category: "Agents" },
    ],
  },
  {
    number: 7,
    title: "Deployment & production",
    subtitle: "Month 7–8",
    topics: [
      { id: "fastapi", number: 109, title: "FastAPI wrapping AI logic in an API", category: "Deploy" },
      { id: "python-async", number: 110, title: "Async in Python why AI APIs need it", category: "Deploy" },
      { id: "env-secrets", number: 111, title: "Environment variables and secret management", category: "Deploy" },
      { id: "docker", number: 112, title: "Docker containerising your AI app", category: "Deploy" },
      { id: "deploy-render", number: 113, title: "Deploying to Render or Railway free tier workflow", category: "Deploy" },
      { id: "logging-monitoring", number: 114, title: "Logging and monitoring AI responses in production", category: "Deploy" },
      { id: "rate-limiting", number: 115, title: "Rate limiting and cost controls on your API", category: "Deploy" },
      { id: "nextjs-fastapi", number: 116, title: "Connecting your Next.js frontend to a FastAPI backend", category: "Deploy" },
    ],
  },
  {
    number: 8,
    title: "Job prep",
    subtitle: "Month 8–9",
    topics: [
      { id: "framing-web-background", number: 117, title: "How to frame your web background as an AI engineering asset", category: "Job prep" },
      { id: "ai-interview-format", number: 118, title: "What AI engineering interviews actually look like", category: "Job prep" },
      { id: "system-design-ai", number: 119, title: "System design for AI systems how to answer design questions", category: "Job prep" },
      { id: "explaining-rag-agents", number: 120, title: "Explaining RAG, agents, and embeddings out loud (interview practice)", category: "Job prep" },
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
  Deploy: "var(--color-career-deploy)",
  "Job prep": "var(--color-career-job)",
};

export const CATEGORY_BG: Record<CurriculumCategory, string> = {
  Math: "var(--color-career-math-bg)",
  Python: "var(--color-career-python-bg)",
  ML: "var(--color-career-ml-bg)",
  "LLM APIs": "var(--color-career-llm-bg)",
  RAG: "var(--color-career-rag-bg)",
  Agents: "var(--color-career-agents-bg)",
  Deploy: "var(--color-career-deploy-bg)",
  "Job prep": "var(--color-career-job-bg)",
};
