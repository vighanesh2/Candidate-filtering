export type Job = {
  id: string;
  title: string;
  team: string;
  location: string;
  remote: "Remote" | "Hybrid" | "On-site";
  level: "Entry" | "Mid" | "Senior" | "Lead" | "Staff";
  open: boolean;
  interviewerEmail: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave?: string[];
};

export const jobs: Job[] = [
  {
    id: "swe-backend",
    title: "Backend Engineer",
    team: "Platform Engineering",
    location: "San Francisco, CA",
    remote: "Hybrid",
    level: "Senior",
    open: true,
    interviewerEmail: "vighanesh2@gmail.com",
    responsibilities: [
      "Design, build, and maintain high-performance APIs and microservices at scale.",
      "Collaborate with product and frontend teams to define and implement new features end-to-end.",
      "Own reliability and observability of backend services — alerting, dashboards, on-call.",
      "Lead technical design reviews and contribute to architecture decisions.",
      "Mentor junior engineers and participate in hiring loops.",
    ],
    requirements: [
      "5+ years of professional backend engineering experience.",
      "Proficiency in at least one of: Go, Python, Node.js, or Java.",
      "Strong understanding of relational databases (PostgreSQL preferred) and query optimization.",
      "Experience designing RESTful or gRPC APIs and working with distributed systems.",
      "Familiarity with cloud infrastructure (AWS, GCP, or Azure) and containerization (Docker/Kubernetes).",
    ],
    niceToHave: [
      "Experience with event-driven architectures (Kafka, SQS).",
      "Prior work on multi-tenant SaaS products.",
      "Contributions to open-source projects.",
    ],
  },
  {
    id: "ml-engineer",
    title: "Machine Learning Engineer",
    team: "AI & Data",
    location: "Remote",
    remote: "Remote",
    level: "Mid",
    open: true,
    interviewerEmail: "vighanesh2@gmail.com",
    responsibilities: [
      "Develop and deploy ML models for candidate matching, ranking, and resume parsing.",
      "Collaborate with data scientists to move research prototypes into production systems.",
      "Build and maintain data pipelines for model training, evaluation, and monitoring.",
      "Instrument models for drift detection and conduct regular retraining cycles.",
      "Work closely with product to translate business requirements into ML problem formulations.",
    ],
    requirements: [
      "3+ years of experience shipping ML models to production.",
      "Strong Python skills; proficiency with PyTorch or TensorFlow.",
      "Hands-on experience with NLP techniques (embeddings, transformers, text classification).",
      "Familiarity with MLOps tooling: experiment tracking (MLflow/W&B), model registries, and serving frameworks.",
      "Comfortable working with large datasets and cloud data warehouses (Snowflake, BigQuery).",
    ],
    niceToHave: [
      "Experience fine-tuning large language models (LLMs).",
      "Background in information retrieval or recommendation systems.",
      "Published research or technical blog posts in ML.",
    ],
  },
  {
    id: "product-designer",
    title: "Product Designer",
    team: "Design",
    location: "New York, NY",
    remote: "Hybrid",
    level: "Senior",
    open: false,
    interviewerEmail: "vighanesh2@gmail.com",
    responsibilities: [
      "Own end-to-end design for core candidate and recruiter-facing product surfaces.",
      "Conduct user research, synthesize insights, and translate them into product decisions.",
      "Create wireframes, prototypes, and high-fidelity designs in Figma.",
      "Establish and evolve the design system in collaboration with frontend engineers.",
      "Facilitate design critiques and drive cross-functional alignment on UX direction.",
    ],
    requirements: [
      "5+ years of product design experience at a SaaS or consumer tech company.",
      "Expert-level Figma skills including component libraries and auto-layout.",
      "Strong portfolio demonstrating end-to-end design process — research through ship.",
      "Proven ability to balance user needs with technical constraints and business goals.",
      "Experience designing complex data-heavy interfaces (dashboards, tables, filters).",
    ],
    niceToHave: [
      "Experience designing for HR tech, ATS, or recruitment tools.",
      "Familiarity with accessibility standards (WCAG 2.1 AA).",
      "Basic front-end knowledge (HTML/CSS) to collaborate more fluidly with engineers.",
    ],
  },
  {
    id: "frontend-engineer",
    title: "Frontend Engineer",
    team: "Product Engineering",
    location: "Remote",
    remote: "Remote",
    level: "Mid",
    open: true,
    interviewerEmail: "vighanesh2@gmail.com",
    responsibilities: [
      "Build performant, accessible UI components and pages using React and TypeScript.",
      "Collaborate tightly with designers to implement pixel-accurate, delightful interfaces.",
      "Write end-to-end and unit tests to maintain product quality as the codebase scales.",
      "Participate in API design discussions to ensure frontend needs are represented.",
      "Identify and resolve performance bottlenecks in the web application.",
    ],
    requirements: [
      "3+ years of professional frontend development experience.",
      "Strong proficiency in React, TypeScript, and modern CSS (Tailwind or CSS-in-JS).",
      "Experience with state management patterns and async data fetching (React Query, SWR, or similar).",
      "Solid understanding of web performance, accessibility, and cross-browser compatibility.",
      "Comfortable working in a CI/CD environment with Git-based workflows.",
    ],
    niceToHave: [
      "Experience with Next.js and server components.",
      "Familiarity with testing libraries (Vitest, Playwright, Testing Library).",
      "Eye for design and ability to give meaningful design feedback.",
    ],
  },
];
