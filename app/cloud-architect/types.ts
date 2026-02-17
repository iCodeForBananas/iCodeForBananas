export enum AWSServiceType {
  EC2 = "EC2",
  LAMBDA = "Lambda",
  S3 = "S3",
  RDS = "RDS",
  DYNAMODB = "DynamoDB",
  ELB = "ELB",
  CLOUDFRONT = "CloudFront",
  SQS = "SQS",
  API_GATEWAY = "API Gateway",
  ROUTE53 = "Route 53",
  ELASTICACHE = "ElastiCache",
}

export interface Node {
  id: string;
  type: AWSServiceType;
  x: number;
  y: number;
  label: string;
  config: Record<string, any>;
}

export interface Connection {
  from: string;
  to: string;
}

export interface Scenario {
  id: number;
  level: number;
  title: string;
  description: string;
  targetRPS: number;
  budget: number;
  difficulty: "Easy" | "Medium" | "Hard";
}

export interface SimulationResult {
  score: number;
  feedback: string;
  bottlenecks: string[];
  hints: string[];
  trafficStats: { time: string; load: number; processed: number }[];
}
