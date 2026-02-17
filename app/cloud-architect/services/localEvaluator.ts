import { AWSServiceType, Node, Connection, Scenario, SimulationResult } from "../types";

// Vague hints per service so we never reveal the answer directly
const SERVICE_HINTS: Record<AWSServiceType, string> = {
  [AWSServiceType.EC2]: "Consider whether you need a scalable virtual server for compute.",
  [AWSServiceType.LAMBDA]: "Think about a serverless compute option that runs code on demand.",
  [AWSServiceType.S3]: "You may need an object storage service for static assets or data.",
  [AWSServiceType.RDS]: "A managed relational database might be needed here.",
  [AWSServiceType.DYNAMODB]: "Consider a fast, flexible NoSQL database for this workload.",
  [AWSServiceType.ELB]: "Think about how to distribute incoming traffic across targets.",
  [AWSServiceType.CLOUDFRONT]: "A content delivery network could help with global distribution.",
  [AWSServiceType.SQS]: "A message queue could help decouple your architecture.",
  [AWSServiceType.API_GATEWAY]: "You may need a managed service to expose and secure your APIs.",
  [AWSServiceType.ROUTE53]: "Think about DNS management and routing for your domain.",
  [AWSServiceType.ELASTICACHE]: "An in-memory caching layer could improve read performance.",
};

// ── Scenario-specific ideal architecture definitions ──

interface ScenarioRubric {
  requiredServices: AWSServiceType[];
  recommendedServices: AWSServiceType[];
  penalizedServices: AWSServiceType[];
  requiredConfigs: { service: AWSServiceType; key: string; value: boolean | string; reason: string }[];
  requiredConnections: { from: AWSServiceType; to: AWSServiceType; reason: string }[];
  hints: string[];
}

const SCENARIO_RUBRICS: Record<number, ScenarioRubric> = {
  // ── Level 1: The Viral Blog ──
  1: {
    requiredServices: [AWSServiceType.S3, AWSServiceType.CLOUDFRONT],
    recommendedServices: [AWSServiceType.ROUTE53],
    penalizedServices: [AWSServiceType.RDS, AWSServiceType.ELB, AWSServiceType.SQS, AWSServiceType.DYNAMODB],
    requiredConfigs: [
      {
        service: AWSServiceType.CLOUDFRONT,
        key: "oac",
        value: true,
        reason:
          "CloudFront should have Origin Access Control enabled when serving from S3 to prevent direct bucket access.",
      },
      {
        service: AWSServiceType.CLOUDFRONT,
        key: "cacheOptimized",
        value: true,
        reason: "Cache optimization should be enabled on CloudFront to handle viral traffic spikes efficiently.",
      },
      {
        service: AWSServiceType.S3,
        key: "versioning",
        value: true,
        reason: "S3 bucket versioning protects against accidental overwrites of your blog content.",
      },
    ],
    requiredConnections: [
      {
        from: AWSServiceType.CLOUDFRONT,
        to: AWSServiceType.S3,
        reason: "CloudFront should connect to S3 to serve static content through the CDN edge network.",
      },
    ],
    hints: [
      "A static blog is best served via S3 behind CloudFront — no need for compute instances.",
      "Enable Origin Access Control (OAC) on CloudFront so users can't bypass the CDN and hit S3 directly.",
      "Route 53 with health checks gives you DNS-level failover for free.",
      "Adding databases or load balancers to a static site wastes budget and adds unnecessary complexity.",
      "CloudFront cache optimization dramatically reduces origin requests during traffic spikes.",
    ],
  },

  // ── Level 2: Marketing Landing Page ──
  2: {
    requiredServices: [AWSServiceType.S3, AWSServiceType.CLOUDFRONT, AWSServiceType.LAMBDA],
    recommendedServices: [AWSServiceType.API_GATEWAY, AWSServiceType.DYNAMODB, AWSServiceType.ROUTE53],
    penalizedServices: [AWSServiceType.EC2, AWSServiceType.ELB, AWSServiceType.RDS],
    requiredConfigs: [
      {
        service: AWSServiceType.CLOUDFRONT,
        key: "oac",
        value: true,
        reason: "Origin Access Control prevents bypassing CloudFront to hit your S3 bucket directly.",
      },
      {
        service: AWSServiceType.CLOUDFRONT,
        key: "cacheOptimized",
        value: true,
        reason: "Cache optimization is critical for a high-traffic campaign page with static images.",
      },
    ],
    requiredConnections: [
      {
        from: AWSServiceType.CLOUDFRONT,
        to: AWSServiceType.S3,
        reason: "CloudFront should serve your landing page assets from S3.",
      },
    ],
    hints: [
      "Static assets (HTML, images) belong in S3 behind CloudFront. The signup form can be a Lambda function.",
      "Use API Gateway + Lambda for the signup endpoint instead of running full EC2 instances.",
      "DynamoDB is a lightweight, serverless choice to store signup form submissions.",
      "You don't need RDS or EC2 for a simple campaign page — keep costs low with serverless.",
      "Enable OAC on CloudFront so your S3 bucket isn't publicly accessible.",
    ],
  },

  // ── Level 3: REST API Service ──
  3: {
    requiredServices: [AWSServiceType.API_GATEWAY, AWSServiceType.LAMBDA],
    recommendedServices: [AWSServiceType.DYNAMODB, AWSServiceType.CLOUDFRONT, AWSServiceType.ROUTE53],
    penalizedServices: [AWSServiceType.EC2, AWSServiceType.ELB, AWSServiceType.RDS],
    requiredConfigs: [
      {
        service: AWSServiceType.API_GATEWAY,
        key: "throttling",
        value: true,
        reason: "API throttling prevents abuse and protects your Lambda functions from runaway invocations.",
      },
      {
        service: AWSServiceType.LAMBDA,
        key: "provisionedConcurrency",
        value: true,
        reason: "Provisioned concurrency eliminates cold starts for a responsive mobile API experience.",
      },
      {
        service: AWSServiceType.DYNAMODB,
        key: "onDemand",
        value: true,
        reason: "On-demand scaling lets DynamoDB handle unpredictable mobile app traffic patterns.",
      },
    ],
    requiredConnections: [
      {
        from: AWSServiceType.API_GATEWAY,
        to: AWSServiceType.LAMBDA,
        reason: "API Gateway must route requests to Lambda functions for processing.",
      },
    ],
    hints: [
      "Serverless REST APIs use API Gateway → Lambda → DynamoDB. No servers to manage.",
      "Enable API throttling to protect against abusive clients hammering your mobile API.",
      "Provisioned concurrency on Lambda eliminates cold starts for consistent response times.",
      "DynamoDB with on-demand scaling is ideal for unpredictable mobile traffic patterns.",
      "CloudFront in front of API Gateway can cache GET responses and reduce Lambda invocations.",
    ],
  },

  // ── Level 4: E-Commerce Launch ──
  4: {
    requiredServices: [AWSServiceType.EC2, AWSServiceType.RDS, AWSServiceType.ELB],
    recommendedServices: [
      AWSServiceType.CLOUDFRONT,
      AWSServiceType.ELASTICACHE,
      AWSServiceType.S3,
      AWSServiceType.ROUTE53,
    ],
    penalizedServices: [],
    requiredConfigs: [
      {
        service: AWSServiceType.EC2,
        key: "autoScaling",
        value: true,
        reason:
          "Auto Scaling is critical for handling 50,000 users — without it a single instance will buckle under traffic spikes.",
      },
      {
        service: AWSServiceType.RDS,
        key: "multiAZ",
        value: true,
        reason:
          "Multi-AZ deployment is essential for an e-commerce database — a single-AZ failure would take down checkout.",
      },
      {
        service: AWSServiceType.RDS,
        key: "readReplicas",
        value: true,
        reason:
          "Read replicas offload product catalog queries from the primary DB, preventing lock contention during heavy browsing.",
      },
      {
        service: AWSServiceType.ELB,
        key: "crossZone",
        value: true,
        reason: "Cross-zone load balancing ensures even traffic distribution across all EC2 instances.",
      },
    ],
    requiredConnections: [
      {
        from: AWSServiceType.ELB,
        to: AWSServiceType.EC2,
        reason: "The Load Balancer must route traffic to your EC2 instances for horizontal scaling to work.",
      },
      {
        from: AWSServiceType.EC2,
        to: AWSServiceType.RDS,
        reason: "EC2 application servers need a connection to the RDS database for product and order data.",
      },
    ],
    hints: [
      "A classic e-commerce stack needs ELB → EC2 (auto-scaling) → RDS (Multi-AZ). Start there.",
      "Enable Auto Scaling on EC2 so your fleet grows with demand during the launch rush.",
      "Turn on Multi-AZ for RDS — a single database failure during checkout is catastrophic.",
      "Add ElastiCache in front of your database to cache product listings and session data.",
      "CloudFront can serve static assets (images, CSS, JS) and reduce load on your origin servers.",
      "Read Replicas on RDS separate read-heavy catalog browsing from write-heavy cart operations.",
    ],
  },

  // ── Level 5: Real-Time Dashboard ──
  5: {
    requiredServices: [AWSServiceType.LAMBDA, AWSServiceType.DYNAMODB, AWSServiceType.API_GATEWAY],
    recommendedServices: [AWSServiceType.ELASTICACHE, AWSServiceType.SQS, AWSServiceType.CLOUDFRONT, AWSServiceType.S3],
    penalizedServices: [AWSServiceType.RDS],
    requiredConfigs: [
      {
        service: AWSServiceType.DYNAMODB,
        key: "onDemand",
        value: true,
        reason: "On-demand scaling is crucial for handling bursty analytics event ingestion.",
      },
      {
        service: AWSServiceType.ELASTICACHE,
        key: "clusterMode",
        value: true,
        reason: "Cluster mode on ElastiCache distributes hot keys across shards for sub-second query latency.",
      },
      {
        service: AWSServiceType.ELASTICACHE,
        key: "engine",
        value: "Redis",
        reason: "Redis supports sorted sets and pub/sub — ideal for real-time leaderboards and live updates.",
      },
      {
        service: AWSServiceType.API_GATEWAY,
        key: "throttling",
        value: true,
        reason: "Throttling prevents event flood from overwhelming your ingestion pipeline.",
      },
    ],
    requiredConnections: [
      {
        from: AWSServiceType.API_GATEWAY,
        to: AWSServiceType.LAMBDA,
        reason: "API Gateway should route incoming events to Lambda for processing.",
      },
      {
        from: AWSServiceType.LAMBDA,
        to: AWSServiceType.DYNAMODB,
        reason: "Lambda should write processed events to DynamoDB for persistence.",
      },
    ],
    hints: [
      "Ingest events through API Gateway → Lambda → DynamoDB, then query via ElastiCache for speed.",
      "Redis (cluster mode) gives you sub-millisecond reads — perfect for live dashboard queries.",
      "Use SQS between ingestion and processing to buffer event spikes and prevent data loss.",
      "DynamoDB on-demand scaling handles bursty analytics workloads without capacity planning.",
      "Serve the dashboard frontend from S3 + CloudFront for instant page loads.",
      "RDS is too slow for real-time analytics at this scale — use DynamoDB + ElastiCache instead.",
    ],
  },

  // ── Level 6: Microservices Platform ──
  6: {
    requiredServices: [AWSServiceType.ELB, AWSServiceType.EC2, AWSServiceType.SQS],
    recommendedServices: [
      AWSServiceType.RDS,
      AWSServiceType.DYNAMODB,
      AWSServiceType.LAMBDA,
      AWSServiceType.API_GATEWAY,
      AWSServiceType.ELASTICACHE,
      AWSServiceType.ROUTE53,
    ],
    penalizedServices: [],
    requiredConfigs: [
      {
        service: AWSServiceType.EC2,
        key: "autoScaling",
        value: true,
        reason: "Each microservice fleet needs auto-scaling to handle independent traffic patterns.",
      },
      {
        service: AWSServiceType.SQS,
        key: "dlq",
        value: true,
        reason: "Dead letter queues capture failed messages between microservices for debugging and replay.",
      },
      {
        service: AWSServiceType.SQS,
        key: "fifo",
        value: true,
        reason: "FIFO queues guarantee message ordering — critical for order processing and state transitions.",
      },
      {
        service: AWSServiceType.ELB,
        key: "crossZone",
        value: true,
        reason: "Cross-zone balancing ensures traffic spreads evenly across microservice instances in all AZs.",
      },
    ],
    requiredConnections: [
      {
        from: AWSServiceType.ELB,
        to: AWSServiceType.EC2,
        reason: "Load balancer should distribute traffic across your microservice EC2 instances.",
      },
      {
        from: AWSServiceType.EC2,
        to: AWSServiceType.SQS,
        reason: "Microservices should communicate asynchronously through SQS for decoupling.",
      },
    ],
    hints: [
      "Microservices communicate best through async messaging (SQS) rather than direct HTTP calls.",
      "Enable FIFO on SQS to guarantee message ordering between services that process state changes.",
      "Each service needs its own auto-scaling group behind a load balancer for independent scaling.",
      "Dead letter queues on SQS are essential — they catch failed inter-service messages for replay.",
      "Consider Lambda for lightweight event-driven microservices and EC2 for long-running ones.",
      "API Gateway provides a unified entry point, routing requests to the correct microservice.",
    ],
  },

  // ── Level 7: Global SaaS Platform ──
  7: {
    requiredServices: [
      AWSServiceType.CLOUDFRONT,
      AWSServiceType.ROUTE53,
      AWSServiceType.ELB,
      AWSServiceType.EC2,
      AWSServiceType.DYNAMODB,
    ],
    recommendedServices: [
      AWSServiceType.ELASTICACHE,
      AWSServiceType.SQS,
      AWSServiceType.S3,
      AWSServiceType.API_GATEWAY,
    ],
    penalizedServices: [],
    requiredConfigs: [
      {
        service: AWSServiceType.DYNAMODB,
        key: "globalTables",
        value: true,
        reason: "Global Tables replicate data across regions for low-latency reads in NA, EU, and APAC.",
      },
      {
        service: AWSServiceType.DYNAMODB,
        key: "onDemand",
        value: true,
        reason: "On-demand scaling handles unpredictable multi-tenant traffic without capacity planning.",
      },
      {
        service: AWSServiceType.CLOUDFRONT,
        key: "waf",
        value: true,
        reason: "Edge WAF on CloudFront protects your SaaS from DDoS and bot attacks across all regions.",
      },
      {
        service: AWSServiceType.EC2,
        key: "autoScaling",
        value: true,
        reason: "Auto-scaling across regions ensures each tenant gets consistent performance.",
      },
      {
        service: AWSServiceType.ROUTE53,
        key: "routingPolicy",
        value: "Latency",
        reason: "Latency-based routing directs users to the closest regional deployment.",
      },
      {
        service: AWSServiceType.ROUTE53,
        key: "healthChecks",
        value: true,
        reason: "Health checks enable automatic failover if an entire region goes down.",
      },
    ],
    requiredConnections: [
      {
        from: AWSServiceType.CLOUDFRONT,
        to: AWSServiceType.ELB,
        reason: "CloudFront should connect to your regional load balancers for edge-to-origin routing.",
      },
      {
        from: AWSServiceType.ELB,
        to: AWSServiceType.EC2,
        reason: "Load balancers distribute traffic across your application fleet in each region.",
      },
      {
        from: AWSServiceType.EC2,
        to: AWSServiceType.DYNAMODB,
        reason: "Application servers need to read/write tenant data from DynamoDB Global Tables.",
      },
    ],
    hints: [
      "Use Route 53 latency-based routing to direct each user to the closest regional deployment.",
      "DynamoDB Global Tables replicate data across regions — essential for a multi-region SaaS.",
      "CloudFront with Edge WAF protects all regions from attacks at the edge.",
      "Health checks on Route 53 enable automatic DNS failover if an entire region goes down.",
      "ElastiCache in each region caches tenant data locally for sub-millisecond reads.",
      "On-demand scaling for DynamoDB eliminates the need to pre-provision for unpredictable tenants.",
    ],
  },

  // ── Level 8: Prime Day Scale ──
  8: {
    requiredServices: [AWSServiceType.CLOUDFRONT, AWSServiceType.API_GATEWAY, AWSServiceType.SQS],
    recommendedServices: [
      AWSServiceType.LAMBDA,
      AWSServiceType.DYNAMODB,
      AWSServiceType.EC2,
      AWSServiceType.ELASTICACHE,
      AWSServiceType.ROUTE53,
      AWSServiceType.S3,
      AWSServiceType.ELB,
    ],
    penalizedServices: [],
    requiredConfigs: [
      {
        service: AWSServiceType.DYNAMODB,
        key: "globalTables",
        value: true,
        reason: "Global Tables replicate data across regions — mandatory for a multi-region Prime Day event.",
      },
      {
        service: AWSServiceType.DYNAMODB,
        key: "onDemand",
        value: true,
        reason: "On-demand scaling lets DynamoDB absorb unpredictable Prime Day traffic without pre-provisioning.",
      },
      {
        service: AWSServiceType.CLOUDFRONT,
        key: "waf",
        value: true,
        reason: "Edge WAF on CloudFront blocks malicious traffic at the edge before it reaches your origin.",
      },
      {
        service: AWSServiceType.SQS,
        key: "dlq",
        value: true,
        reason: "A Dead Letter Queue captures failed order messages so no purchase is silently lost.",
      },
      {
        service: AWSServiceType.EC2,
        key: "autoScaling",
        value: true,
        reason: "At 1M+ RPM, auto-scaling is non-negotiable — fixed-size fleets will collapse under load.",
      },
      {
        service: AWSServiceType.API_GATEWAY,
        key: "throttling",
        value: true,
        reason: "API throttling protects your backend from being overwhelmed during traffic surges.",
      },
    ],
    requiredConnections: [
      {
        from: AWSServiceType.CLOUDFRONT,
        to: AWSServiceType.API_GATEWAY,
        reason: "CloudFront should front your API Gateway to cache API responses and absorb traffic at the edge.",
      },
      {
        from: AWSServiceType.API_GATEWAY,
        to: AWSServiceType.LAMBDA,
        reason: "API Gateway should route to Lambda for serverless, auto-scaling request processing.",
      },
    ],
    hints: [
      "At 1M+ RPM you need a multi-tier architecture: CloudFront → API Gateway → Lambda/EC2 → DynamoDB.",
      "Enable Global Tables on DynamoDB for multi-region data replication — the scenario demands it.",
      "Use SQS with a Dead Letter Queue between services to decouple and guarantee order processing.",
      "Edge WAF on CloudFront protects against DDoS and bot traffic that spikes on major sale events.",
      "API Gateway throttling prevents a traffic surge from cascading failures into your backend.",
      "ElastiCache (Redis cluster mode) can absorb millions of reads for session and inventory lookups.",
      "Combine Lambda for spiky workloads with EC2 auto-scaling groups for sustained compute needs.",
    ],
  },

  // ── Level 9: Streaming Media Platform ──
  9: {
    requiredServices: [
      AWSServiceType.CLOUDFRONT,
      AWSServiceType.S3,
      AWSServiceType.EC2,
      AWSServiceType.ELASTICACHE,
      AWSServiceType.ELB,
    ],
    recommendedServices: [
      AWSServiceType.LAMBDA,
      AWSServiceType.SQS,
      AWSServiceType.DYNAMODB,
      AWSServiceType.API_GATEWAY,
      AWSServiceType.ROUTE53,
    ],
    penalizedServices: [],
    requiredConfigs: [
      {
        service: AWSServiceType.CLOUDFRONT,
        key: "cacheOptimized",
        value: true,
        reason: "Cache optimization is critical — video segments must be cached at edge for 2M+ concurrent viewers.",
      },
      {
        service: AWSServiceType.CLOUDFRONT,
        key: "waf",
        value: true,
        reason: "WAF protects against content scraping and DDoS attacks that target streaming platforms.",
      },
      {
        service: AWSServiceType.CLOUDFRONT,
        key: "oac",
        value: true,
        reason: "OAC prevents direct access to your S3 video storage, enforcing CDN-only delivery.",
      },
      {
        service: AWSServiceType.ELASTICACHE,
        key: "clusterMode",
        value: true,
        reason: "Redis cluster mode handles millions of concurrent chat messages and session lookups.",
      },
      {
        service: AWSServiceType.ELASTICACHE,
        key: "engine",
        value: "Redis",
        reason: "Redis pub/sub powers real-time chat delivery to millions of concurrent viewers.",
      },
      {
        service: AWSServiceType.EC2,
        key: "autoScaling",
        value: true,
        reason: "Auto-scaling is essential for chat and transcoding servers handling 2M+ concurrent viewers.",
      },
    ],
    requiredConnections: [
      {
        from: AWSServiceType.CLOUDFRONT,
        to: AWSServiceType.S3,
        reason: "CloudFront must serve video segments from S3 to deliver content at the edge worldwide.",
      },
      {
        from: AWSServiceType.ELB,
        to: AWSServiceType.EC2,
        reason: "Load balancer distributes chat and API traffic across your server fleet.",
      },
      {
        from: AWSServiceType.EC2,
        to: AWSServiceType.ELASTICACHE,
        reason: "Chat servers need ElastiCache (Redis) for real-time message pub/sub.",
      },
    ],
    hints: [
      "Video content lives in S3, served globally through CloudFront with cache optimization enabled.",
      "Real-time chat needs Redis (cluster mode) for pub/sub across millions of concurrent connections.",
      "Enable OAC on CloudFront to prevent users from bypassing CDN and downloading directly from S3.",
      "Use SQS to queue video transcoding jobs so uploads don't block the live viewing experience.",
      "Auto-scaling EC2 handles variable chat server load as viewers join and leave streams.",
      "WAF on CloudFront protects against content scraping bots and volumetric DDoS attacks.",
      "DynamoDB can store viewer watch history and recommendations with on-demand scaling.",
    ],
  },

  // ── Level 10: Planetary Scale Infra ──
  10: {
    requiredServices: [
      AWSServiceType.CLOUDFRONT,
      AWSServiceType.ROUTE53,
      AWSServiceType.API_GATEWAY,
      AWSServiceType.LAMBDA,
      AWSServiceType.EC2,
      AWSServiceType.DYNAMODB,
      AWSServiceType.SQS,
      AWSServiceType.ELASTICACHE,
      AWSServiceType.ELB,
      AWSServiceType.S3,
    ],
    recommendedServices: [AWSServiceType.RDS],
    penalizedServices: [],
    requiredConfigs: [
      {
        service: AWSServiceType.ROUTE53,
        key: "routingPolicy",
        value: "Failover",
        reason: "Failover routing is mandatory for zero-downtime — it switches DNS when a region goes down.",
      },
      {
        service: AWSServiceType.ROUTE53,
        key: "healthChecks",
        value: true,
        reason: "Health checks detect regional failures and trigger automatic DNS failover.",
      },
      {
        service: AWSServiceType.DYNAMODB,
        key: "globalTables",
        value: true,
        reason: "Global Tables provide active-active multi-region data replication for 5M+ RPM.",
      },
      {
        service: AWSServiceType.DYNAMODB,
        key: "onDemand",
        value: true,
        reason: "On-demand scaling absorbs planetary-scale traffic spikes without manual intervention.",
      },
      {
        service: AWSServiceType.CLOUDFRONT,
        key: "waf",
        value: true,
        reason: "Edge WAF is non-negotiable at this scale — attacks target high-profile planetary-scale systems.",
      },
      {
        service: AWSServiceType.CLOUDFRONT,
        key: "oac",
        value: true,
        reason: "OAC enforces CDN-only access to origin resources across all regions.",
      },
      {
        service: AWSServiceType.EC2,
        key: "autoScaling",
        value: true,
        reason: "Auto-scaling across multiple regions is fundamental for 5M+ RPM with zero-downtime.",
      },
      {
        service: AWSServiceType.SQS,
        key: "dlq",
        value: true,
        reason: "Dead letter queues ensure no message is lost during cross-region async processing.",
      },
      {
        service: AWSServiceType.SQS,
        key: "fifo",
        value: true,
        reason: "FIFO guarantees ordering for critical operations like financial transactions and deploys.",
      },
      {
        service: AWSServiceType.ELASTICACHE,
        key: "clusterMode",
        value: true,
        reason: "Redis cluster mode distributes cache across shards for millions of concurrent lookups.",
      },
      {
        service: AWSServiceType.API_GATEWAY,
        key: "throttling",
        value: true,
        reason: "Throttling protects downstream services from being overwhelmed at planetary scale.",
      },
      {
        service: AWSServiceType.API_GATEWAY,
        key: "caching",
        value: true,
        reason: "API caching reduces Lambda invocations by orders of magnitude at this traffic level.",
      },
      {
        service: AWSServiceType.LAMBDA,
        key: "provisionedConcurrency",
        value: true,
        reason: "Provisioned concurrency eliminates cold starts for latency-sensitive hot paths.",
      },
    ],
    requiredConnections: [
      {
        from: AWSServiceType.CLOUDFRONT,
        to: AWSServiceType.API_GATEWAY,
        reason: "CloudFront must front API Gateway for edge caching and WAF protection at planetary scale.",
      },
      {
        from: AWSServiceType.API_GATEWAY,
        to: AWSServiceType.LAMBDA,
        reason: "API Gateway routes to Lambda for auto-scaling serverless request processing.",
      },
      {
        from: AWSServiceType.ELB,
        to: AWSServiceType.EC2,
        reason: "Load balancer distributes long-running workloads across auto-scaling EC2 fleets.",
      },
      {
        from: AWSServiceType.EC2,
        to: AWSServiceType.DYNAMODB,
        reason: "EC2 services need access to DynamoDB Global Tables for persistent data.",
      },
      {
        from: AWSServiceType.EC2,
        to: AWSServiceType.SQS,
        reason: "Async processing between services must flow through SQS for decoupling and reliability.",
      },
    ],
    hints: [
      "Planetary scale requires EVERY layer: CloudFront → API Gateway → Lambda + EC2 → DynamoDB, with SQS between services.",
      "Route 53 failover routing + health checks = automatic region-level disaster recovery.",
      "DynamoDB Global Tables + on-demand = active-active multi-region data at any scale.",
      "All 11 AWS services should be present — this is the ultimate architecture challenge.",
      "FIFO queues with DLQ guarantee ordering and recoverability for mission-critical flows.",
      "API Gateway caching + throttling reduces downstream load by 10-100x at this scale.",
      "Provisioned concurrency on Lambda ensures zero cold starts on latency-sensitive paths.",
      "Redis cluster mode in ElastiCache handles millions of concurrent cache lookups per second.",
    ],
  },
};

// ── Helper utilities ──

function hasService(nodes: Node[], type: AWSServiceType): boolean {
  return nodes.some((n) => n.type === type);
}

function getNodesByType(nodes: Node[], type: AWSServiceType): Node[] {
  return nodes.filter((n) => n.type === type);
}

function hasConnection(nodes: Node[], connections: Connection[], from: AWSServiceType, to: AWSServiceType): boolean {
  return connections.some((c) => {
    const fromNode = nodes.find((n) => n.id === c.from);
    const toNode = nodes.find((n) => n.id === c.to);
    return fromNode?.type === from && toNode?.type === to;
  });
}

function getConfigValue(node: Node, key: string): unknown {
  return node.config?.[key];
}

// ── Core static evaluator ──

export function evaluateDesignLocally(scenario: Scenario, nodes: Node[], connections: Connection[]): SimulationResult {
  const rubric = SCENARIO_RUBRICS[scenario.id];
  if (!rubric) {
    return fallbackResult();
  }

  let score = 50; // baseline
  const bottlenecks: string[] = [];
  const hintSet = new Set<string>();
  const feedbackParts: string[] = [];

  // ── 1. Required services ──
  let requiredPresent = 0;
  for (const svc of rubric.requiredServices) {
    if (hasService(nodes, svc)) {
      requiredPresent++;
    } else {
      bottlenecks.push(SERVICE_HINTS[svc] ?? "You're missing a key service for this scenario.");
      const hint = rubric.hints.find((h) => h.toLowerCase().includes(svc.toLowerCase()));
      if (hint) hintSet.add(hint);
    }
  }
  const requiredRatio = rubric.requiredServices.length > 0 ? requiredPresent / rubric.requiredServices.length : 1;
  score += Math.round(requiredRatio * 20); // up to +20

  // ── 2. Recommended services ──
  let recommendedPresent = 0;
  for (const svc of rubric.recommendedServices) {
    if (hasService(nodes, svc)) {
      recommendedPresent++;
    }
  }
  const recRatio = rubric.recommendedServices.length > 0 ? recommendedPresent / rubric.recommendedServices.length : 0;
  score += Math.round(recRatio * 10); // up to +10

  // ── 3. Penalized (unnecessary) services ──
  let penaltyCount = 0;
  for (const svc of rubric.penalizedServices) {
    if (hasService(nodes, svc)) {
      penaltyCount++;
      bottlenecks.push(`Unnecessary service: ${svc} adds cost and complexity for this scenario.`);
    }
  }
  score -= penaltyCount * 5;

  // ── 4. Configuration checks ──
  let configHits = 0;
  let configTotal = 0;
  for (const cfg of rubric.requiredConfigs) {
    const serviceNodes = getNodesByType(nodes, cfg.service);
    if (serviceNodes.length === 0) continue;
    configTotal++;
    const node = serviceNodes[0];
    const actual = getConfigValue(node, cfg.key);
    if (actual === cfg.value) {
      configHits++;
    } else {
      bottlenecks.push(cfg.reason);
      const hint = rubric.hints.find(
        (h) => h.toLowerCase().includes(cfg.key.toLowerCase()) || h.toLowerCase().includes(cfg.service.toLowerCase()),
      );
      if (hint) hintSet.add(hint);
    }
  }
  if (configTotal > 0) {
    score += Math.round((configHits / configTotal) * 15); // up to +15
  }

  // ── 5. Connection checks ──
  let connHits = 0;
  for (const rc of rubric.requiredConnections) {
    if (hasService(nodes, rc.from) && hasService(nodes, rc.to)) {
      if (hasConnection(nodes, connections, rc.from, rc.to)) {
        connHits++;
      } else {
        bottlenecks.push(rc.reason);
      }
    }
  }
  const connTotal = rubric.requiredConnections.length;
  if (connTotal > 0) {
    score += Math.round((connHits / connTotal) * 10); // up to +10
  }

  // ── 6. Budget analysis ──
  const totalCost = nodes.reduce((sum, n) => {
    const meta = costMetadata()[n.type];
    return sum + (meta?.cost ?? 0);
  }, 0);

  if (totalCost > scenario.budget) {
    const overBy = totalCost - scenario.budget;
    score -= Math.min(15, Math.round((overBy / scenario.budget) * 15));
    bottlenecks.push(
      `Over budget by $${overBy}/hr — consider removing low-value services or choosing cheaper alternatives.`,
    );
  } else if (totalCost <= scenario.budget * 0.5 && nodes.length < 2) {
    score -= 5;
    feedbackParts.push("Your architecture seems under-provisioned for the target load.");
  }

  // ── 7. Orphan node check ──
  const connectedIds = new Set<string>();
  connections.forEach((c) => {
    connectedIds.add(c.from);
    connectedIds.add(c.to);
  });
  const orphans = nodes.filter((n) => !connectedIds.has(n.id));
  if (orphans.length > 0 && nodes.length > 1) {
    score -= orphans.length * 2;
    bottlenecks.push(`${orphans.length} service(s) have no connections — isolated components can't serve traffic.`);
  }

  // ── Clamp score ──
  score = Math.max(0, Math.min(100, score));

  // ── Build feedback ──
  if (score >= 85) {
    feedbackParts.unshift(
      "Excellent architecture! Your design follows AWS Well-Architected best practices for this scenario.",
    );
  } else if (score >= 70) {
    feedbackParts.unshift("Solid foundation — a few configuration tweaks would elevate this to production-ready.");
  } else if (score >= 50) {
    feedbackParts.unshift(
      "Reasonable start, but several critical gaps need attention before this can handle the target load.",
    );
  } else {
    feedbackParts.unshift(
      "This architecture has fundamental issues that would cause failures under the specified load. Review the bottlenecks below.",
    );
  }

  // ── Select hints (pick up to 3) ──
  if (hintSet.size === 0) {
    rubric.hints.slice(0, 2).forEach((h) => hintSet.add(h));
  }
  const finalHints = Array.from(hintSet).slice(0, 3);
  if (finalHints.length === 0) {
    finalHints.push(...rubric.hints.slice(0, 2));
  }

  // ── Generate traffic stats based on score ──
  const trafficStats = generateTrafficStats(score);

  return {
    score,
    feedback: feedbackParts.join(" "),
    bottlenecks: bottlenecks.slice(0, 5),
    hints: finalHints,
    trafficStats,
  };
}

// ── Traffic simulation based on score ──

function generateTrafficStats(score: number): { time: string; load: number; processed: number }[] {
  const processingRatio = score / 100;
  return Array.from({ length: 10 }, (_, i) => {
    const timeLabel = `${i}:00`;
    const peakFactor = 1 - Math.abs(i - 5) / 5;
    const load = Math.round(40 + peakFactor * 60);
    const jitter = Math.sin(i * 1.7) * 5;
    const processed = Math.round(load * processingRatio + jitter);
    return { time: timeLabel, load, processed: Math.max(0, Math.min(load, processed)) };
  });
}

function costMetadata(): Record<string, { cost: number }> {
  return {
    [AWSServiceType.EC2]: { cost: 50 },
    [AWSServiceType.LAMBDA]: { cost: 10 },
    [AWSServiceType.RDS]: { cost: 100 },
    [AWSServiceType.S3]: { cost: 5 },
    [AWSServiceType.CLOUDFRONT]: { cost: 30 },
    [AWSServiceType.ELB]: { cost: 20 },
    [AWSServiceType.DYNAMODB]: { cost: 40 },
    [AWSServiceType.SQS]: { cost: 15 },
    [AWSServiceType.API_GATEWAY]: { cost: 25 },
    [AWSServiceType.ROUTE53]: { cost: 10 },
    [AWSServiceType.ELASTICACHE]: { cost: 60 },
  };
}

function fallbackResult(): SimulationResult {
  return {
    score: 50,
    feedback: "Unable to evaluate this scenario. Please select a valid scenario and try again.",
    bottlenecks: ["Scenario not recognized"],
    hints: ["Select one of the available scenarios from the picker."],
    trafficStats: Array.from({ length: 10 }, (_, i) => ({
      time: `${i}:00`,
      load: 50,
      processed: 40,
    })),
  };
}
