import React from "react";
import { Server, Zap, Database, HardDrive, Globe, Repeat, Network, Layout, Cpu, Layers, Activity } from "lucide-react";
import { AWSServiceType, Scenario } from "./types";

export interface ConfigField {
  key: string;
  label: string;
  type: "toggle" | "select";
  options?: string[];
  default: string | boolean;
}

export const SERVICE_METADATA: Record<
  AWSServiceType,
  {
    icon: React.ReactNode;
    color: string;
    cost: number;
    description: string;
    availableConfigs: ConfigField[];
  }
> = {
  [AWSServiceType.EC2]: {
    icon: <Server size={24} />,
    color: "bg-orange-500",
    cost: 50,
    description: "Virtual Servers",
    availableConfigs: [
      { key: "autoScaling", label: "Auto Scaling", type: "toggle", default: false },
      {
        key: "instanceSize",
        label: "Instance Size",
        type: "select",
        options: ["t3.micro", "m5.large", "c5.4xlarge"],
        default: "t3.micro",
      },
    ],
  },
  [AWSServiceType.LAMBDA]: {
    icon: <Zap size={24} />,
    color: "bg-yellow-500",
    cost: 10,
    description: "Serverless compute",
    availableConfigs: [
      { key: "provisionedConcurrency", label: "Prov. Concurrency", type: "toggle", default: false },
      { key: "memory", label: "Memory", type: "select", options: ["128MB", "1024MB", "3008MB"], default: "128MB" },
    ],
  },
  [AWSServiceType.RDS]: {
    icon: <Database size={24} />,
    color: "bg-blue-600",
    cost: 100,
    description: "Managed SQL DB",
    availableConfigs: [
      { key: "multiAZ", label: "Multi-AZ Deployment", type: "toggle", default: false },
      { key: "readReplicas", label: "Read Replicas", type: "toggle", default: false },
    ],
  },
  [AWSServiceType.S3]: {
    icon: <HardDrive size={24} />,
    color: "bg-green-600",
    cost: 5,
    description: "Object Storage",
    availableConfigs: [
      { key: "versioning", label: "Bucket Versioning", type: "toggle", default: false },
      { key: "intelligentTiering", label: "Intelligent Tiering", type: "toggle", default: true },
    ],
  },
  [AWSServiceType.CLOUDFRONT]: {
    icon: <Globe size={24} />,
    color: "bg-indigo-600",
    cost: 30,
    description: "Global CDN",
    availableConfigs: [
      { key: "oac", label: "Origin Access Control", type: "toggle", default: false },
      { key: "cacheOptimized", label: "Cache Optimized", type: "toggle", default: true },
      { key: "waf", label: "Edge WAF", type: "toggle", default: false },
    ],
  },
  [AWSServiceType.ELB]: {
    icon: <Repeat size={24} />,
    color: "bg-purple-600",
    cost: 20,
    description: "Load Balancer",
    availableConfigs: [
      { key: "crossZone", label: "Cross-Zone Balancing", type: "toggle", default: true },
      { key: "stickiness", label: "Session Stickiness", type: "toggle", default: false },
    ],
  },
  [AWSServiceType.DYNAMODB]: {
    icon: <Layers size={24} />,
    color: "bg-blue-400",
    cost: 40,
    description: "NoSQL Database",
    availableConfigs: [
      { key: "onDemand", label: "On-Demand Scaling", type: "toggle", default: true },
      { key: "globalTables", label: "Global Tables", type: "toggle", default: false },
    ],
  },
  [AWSServiceType.SQS]: {
    icon: <Network size={24} />,
    color: "bg-red-400",
    cost: 15,
    description: "Message Queuing",
    availableConfigs: [
      { key: "fifo", label: "FIFO Queue", type: "toggle", default: false },
      { key: "dlq", label: "Dead Letter Queue", type: "toggle", default: false },
    ],
  },
  [AWSServiceType.API_GATEWAY]: {
    icon: <Layout size={24} />,
    color: "bg-pink-600",
    cost: 25,
    description: "API Management",
    availableConfigs: [
      { key: "throttling", label: "Usage Throttling", type: "toggle", default: true },
      { key: "caching", label: "API Caching", type: "toggle", default: false },
    ],
  },
  [AWSServiceType.ROUTE53]: {
    icon: <Activity size={24} />,
    color: "bg-teal-600",
    cost: 10,
    description: "Scalable DNS",
    availableConfigs: [
      { key: "healthChecks", label: "Health Checks", type: "toggle", default: false },
      {
        key: "routingPolicy",
        label: "Routing Policy",
        type: "select",
        options: ["Simple", "Latency", "Failover"],
        default: "Simple",
      },
    ],
  },
  [AWSServiceType.ELASTICACHE]: {
    icon: <Cpu size={24} />,
    color: "bg-cyan-500",
    cost: 60,
    description: "In-memory Caching",
    availableConfigs: [
      { key: "clusterMode", label: "Cluster Mode", type: "toggle", default: false },
      { key: "engine", label: "Engine", type: "select", options: ["Redis", "Memcached"], default: "Redis" },
    ],
  },
};

export const PASS_THRESHOLD = 70;

export const SCENARIOS: Scenario[] = [
  {
    id: 1,
    level: 1,
    title: "The Viral Blog",
    description: "Your static blog just went viral on Reddit. Handle 10,000 requests per minute with minimal cost.",
    targetRPS: 10000,
    budget: 100,
    difficulty: "Easy",
  },
  {
    id: 2,
    level: 2,
    title: "Marketing Landing Page",
    description:
      "Serve a high-traffic campaign landing page with images and a signup form backed by a simple database.",
    targetRPS: 20000,
    budget: 150,
    difficulty: "Easy",
  },
  {
    id: 3,
    level: 3,
    title: "REST API Service",
    description: "Build a serverless REST API that handles 30,000 requests per minute for a mobile app backend.",
    targetRPS: 30000,
    budget: 200,
    difficulty: "Easy",
  },
  {
    id: 4,
    level: 4,
    title: "E-Commerce Launch",
    description: "Launch a shop with dynamic pricing and inventory. Expect 50,000 users and heavy DB load.",
    targetRPS: 50000,
    budget: 500,
    difficulty: "Medium",
  },
  {
    id: 5,
    level: 5,
    title: "Real-Time Dashboard",
    description: "Build a live analytics dashboard ingesting 100,000 events per minute with sub-second query latency.",
    targetRPS: 100000,
    budget: 600,
    difficulty: "Medium",
  },
  {
    id: 6,
    level: 6,
    title: "Microservices Platform",
    description:
      "Migrate a monolith to microservices. Handle 200,000 RPM across decoupled services with async messaging.",
    targetRPS: 200000,
    budget: 800,
    difficulty: "Medium",
  },
  {
    id: 7,
    level: 7,
    title: "Global SaaS Platform",
    description: "Architect a multi-tenant SaaS serving users worldwide. Requires low latency in NA, EU, and APAC.",
    targetRPS: 500000,
    budget: 1200,
    difficulty: "Hard",
  },
  {
    id: 8,
    level: 8,
    title: "Prime Day Scale",
    description: "Scale for a global shopping event. Must be multi-region and handle 1,000,000+ requests per minute.",
    targetRPS: 1000000,
    budget: 2000,
    difficulty: "Hard",
  },
  {
    id: 9,
    level: 9,
    title: "Streaming Media Platform",
    description: "Architect a video streaming service with 2M+ concurrent viewers, global CDN, and real-time chat.",
    targetRPS: 2000000,
    budget: 2500,
    difficulty: "Hard",
  },
  {
    id: 10,
    level: 10,
    title: "Planetary Scale Infra",
    description:
      "Design the ultimate fault-tolerant, multi-region architecture handling 5M+ RPM with zero-downtime deployments.",
    targetRPS: 5000000,
    budget: 3000,
    difficulty: "Hard",
  },
];
