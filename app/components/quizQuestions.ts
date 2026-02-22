export type Domain = "Cloud Concepts" | "Security & Compliance" | "Technology" | "Billing & Pricing";

export interface Question {
  id: string;
  domain: Domain;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export const QUESTIONS: Question[] = [
  // ── Cloud Concepts ──────────────────────────────────────────────────────────
  {
    id: "cc-01",
    domain: "Cloud Concepts",
    question: "What is the primary benefit of the AWS pay-as-you-go pricing model?",
    options: [
      "A. You pay a flat monthly fee regardless of usage",
      "B. You only pay for the resources you consume, with no upfront costs",
      "C. You receive a discount for committing to a 3-year term",
      "D. You pay in advance for a reserved capacity block",
    ],
    correctIndex: 1,
    explanation:
      "Pay-as-you-go means you are billed only for what you actually use, eliminating large upfront capital expenditures. This converts CapEx to OpEx and lets you scale costs with actual demand.",
  },
  {
    id: "cc-02",
    domain: "Cloud Concepts",
    question: "Which of the following best describes 'elasticity' in cloud computing?",
    options: [
      "A. The ability to run workloads in multiple geographic regions",
      "B. The ability to automatically scale resources up or down based on demand",
      "C. The ability to recover from a disaster in minutes",
      "D. The ability to deploy infrastructure using code",
    ],
    correctIndex: 1,
    explanation:
      "Elasticity is the ability to acquire resources as you need them and release them when you no longer need them. AWS Auto Scaling is a prime example — it adds or removes EC2 instances based on real-time demand.",
  },
  {
    id: "cc-03",
    domain: "Cloud Concepts",
    question: "Which AWS Cloud benefit eliminates the need to guess about infrastructure capacity?",
    options: [
      "A. High availability",
      "B. Agility",
      "C. Elasticity",
      "D. Durability",
    ],
    correctIndex: 2,
    explanation:
      "Elasticity allows you to provision exactly the capacity you need and scale automatically, so you never over-provision (wasting money) or under-provision (causing performance issues).",
  },
  {
    id: "cc-04",
    domain: "Cloud Concepts",
    question: "What does the AWS Shared Responsibility Model state about physical security of data centers?",
    options: [
      "A. The customer is responsible for physical security",
      "B. AWS and the customer share equal responsibility",
      "C. AWS is responsible for physical security of the infrastructure",
      "D. A third-party auditor is responsible",
    ],
    correctIndex: 2,
    explanation:
      "Under the Shared Responsibility Model, AWS is responsible for 'security OF the cloud' — this includes physical data center security, hardware, networking, and the hypervisor. Customers are responsible for 'security IN the cloud' — their data, OS, applications, and configurations.",
  },
  {
    id: "cc-05",
    domain: "Cloud Concepts",
    question: "Which of the following is an advantage of cloud computing over traditional on-premises infrastructure?",
    options: [
      "A. You must predict capacity needs months in advance",
      "B. You trade variable expense for capital expense",
      "C. You benefit from massive economies of scale",
      "D. You are responsible for all hardware maintenance",
    ],
    correctIndex: 2,
    explanation:
      "AWS aggregates usage from hundreds of thousands of customers, achieving massive economies of scale. This allows AWS to offer lower pay-as-you-go prices than most organizations could achieve on their own.",
  },
  {
    id: "cc-06",
    domain: "Cloud Concepts",
    question: "A company wants to deploy its application in multiple AWS Regions to serve global customers with low latency. Which cloud concept does this represent?",
    options: [
      "A. High availability",
      "B. Global reach",
      "C. Elasticity",
      "D. Fault tolerance",
    ],
    correctIndex: 1,
    explanation:
      "AWS has a global infrastructure of Regions and edge locations. Deploying in multiple Regions lets you place compute and data closer to end users worldwide, reducing latency. This is the 'go global in minutes' benefit of AWS.",
  },
  {
    id: "cc-07",
    domain: "Cloud Concepts",
    question: "Which cloud deployment model runs infrastructure exclusively on-premises using virtualization?",
    options: [
      "A. Public cloud",
      "B. Hybrid cloud",
      "C. Private cloud",
      "D. Community cloud",
    ],
    correctIndex: 2,
    explanation:
      "A private cloud (also called on-premises cloud) is dedicated to a single organization and hosted in its own data center. It offers more control but requires the organization to manage all hardware and software.",
  },
  {
    id: "cc-08",
    domain: "Cloud Concepts",
    question: "What is an AWS Region?",
    options: [
      "A. A single data center owned by AWS",
      "B. A geographic area containing multiple, isolated Availability Zones",
      "C. A content delivery network edge location",
      "D. A virtual private network connecting on-premises to AWS",
    ],
    correctIndex: 1,
    explanation:
      "An AWS Region is a physical location in the world that contains multiple Availability Zones (AZs). Each AZ consists of one or more discrete data centers with redundant power, networking, and connectivity.",
  },
  {
    id: "cc-09",
    domain: "Cloud Concepts",
    question: "What is an Availability Zone (AZ)?",
    options: [
      "A. A geographic area containing multiple AWS Regions",
      "B. One or more discrete data centers with redundant power and networking within a Region",
      "C. A global edge location used by Amazon CloudFront",
      "D. A logical grouping of AWS accounts",
    ],
    correctIndex: 1,
    explanation:
      "An Availability Zone is one or more discrete data centers within an AWS Region. AZs are physically separated from each other to isolate failures, but connected with high-bandwidth, low-latency networking.",
  },
  {
    id: "cc-10",
    domain: "Cloud Concepts",
    question: "Which of the following is NOT one of the six advantages of cloud computing as defined by AWS?",
    options: [
      "A. Trade capital expense for variable expense",
      "B. Benefit from massive economies of scale",
      "C. Eliminate all security responsibilities",
      "D. Go global in minutes",
    ],
    correctIndex: 2,
    explanation:
      "AWS lists six advantages of cloud computing, but eliminating all security responsibilities is not one of them. Under the Shared Responsibility Model, customers retain responsibility for security IN the cloud (data, access, OS configuration, etc.).",
  },
  {
    id: "cc-11",
    domain: "Cloud Concepts",
    question: "Which AWS service provides a hybrid cloud connection between an on-premises data center and AWS with a dedicated private network link?",
    options: [
      "A. AWS VPN",
      "B. AWS Direct Connect",
      "C. Amazon CloudFront",
      "D. AWS Transit Gateway",
    ],
    correctIndex: 1,
    explanation:
      "AWS Direct Connect provides a dedicated, private network connection from your on-premises environment to AWS, bypassing the public internet. This offers more consistent network performance and can reduce bandwidth costs.",
  },
  {
    id: "cc-12",
    domain: "Cloud Concepts",
    question: "A startup wants to experiment with a new application without a large upfront investment. Which cloud benefit is most relevant?",
    options: [
      "A. High availability",
      "B. Durability",
      "C. Agility",
      "D. Compliance",
    ],
    correctIndex: 2,
    explanation:
      "Agility in cloud computing means you can quickly spin up resources to experiment and innovate, then shut them down if the experiment fails — all with minimal cost and no long-term commitment. This dramatically lowers the cost of experimentation.",
  },
  {
    id: "cc-13",
    domain: "Cloud Concepts",
    question: "Which of the following is an example of Infrastructure as a Service (IaaS)?",
    options: [
      "A. AWS Lambda",
      "B. Amazon RDS",
      "C. Amazon EC2",
      "D. AWS Elastic Beanstalk",
    ],
    correctIndex: 2,
    explanation:
      "Amazon EC2 is IaaS — it provides raw virtual machines where you control the OS, middleware, and runtime. Lambda is FaaS, RDS is PaaS/managed service, and Elastic Beanstalk is PaaS.",
  },
  {
    id: "cc-14",
    domain: "Cloud Concepts",
    question: "Which of the following is an example of Platform as a Service (PaaS)?",
    options: [
      "A. Amazon EC2",
      "B. AWS Elastic Beanstalk",
      "C. Amazon S3",
      "D. AWS IAM",
    ],
    correctIndex: 1,
    explanation:
      "AWS Elastic Beanstalk is PaaS — you upload your application code and AWS handles the deployment, capacity provisioning, load balancing, and auto-scaling. You don't manage the underlying infrastructure.",
  },
  {
    id: "cc-15",
    domain: "Cloud Concepts",
    question: "What is the Well-Architected Framework pillar that focuses on the ability of a system to recover from failures?",
    options: [
      "A. Performance Efficiency",
      "B. Operational Excellence",
      "C. Reliability",
      "D. Security",
    ],
    correctIndex: 2,
    explanation:
      "The Reliability pillar of the AWS Well-Architected Framework focuses on the ability of a workload to perform its intended function correctly and consistently, including recovering from failures and meeting demand.",
  },
  {
    id: "cc-16",
    domain: "Cloud Concepts",
    question: "Which AWS Well-Architected Framework pillar focuses on using computing resources efficiently to meet system requirements?",
    options: [
      "A. Cost Optimization",
      "B. Performance Efficiency",
      "C. Reliability",
      "D. Sustainability",
    ],
    correctIndex: 1,
    explanation:
      "The Performance Efficiency pillar focuses on using IT and computing resources efficiently. It includes selecting the right resource types and sizes, monitoring performance, and maintaining efficiency as business needs evolve.",
  },

  // ── Security & Compliance ───────────────────────────────────────────────────
  {
    id: "sc-01",
    domain: "Security & Compliance",
    question: "Which AWS service is used to manage user identities and permissions to AWS services?",
    options: [
      "A. Amazon Cognito",
      "B. AWS IAM",
      "C. AWS Shield",
      "D. AWS WAF",
    ],
    correctIndex: 1,
    explanation:
      "AWS Identity and Access Management (IAM) lets you manage access to AWS services and resources securely. You create users, groups, and roles, then attach policies that define what actions are allowed or denied.",
  },
  {
    id: "sc-02",
    domain: "Security & Compliance",
    question: "What is the principle of least privilege?",
    options: [
      "A. Granting users the maximum permissions they might ever need",
      "B. Granting only the permissions required to perform a specific task",
      "C. Sharing credentials among team members to reduce overhead",
      "D. Using the root account for all administrative tasks",
    ],
    correctIndex: 1,
    explanation:
      "The principle of least privilege means granting only the minimum permissions necessary for a user or service to perform its job. This limits the blast radius if credentials are compromised.",
  },
  {
    id: "sc-03",
    domain: "Security & Compliance",
    question: "Which AWS service provides DDoS protection for applications running on AWS?",
    options: [
      "A. AWS WAF",
      "B. Amazon GuardDuty",
      "C. AWS Shield",
      "D. AWS Firewall Manager",
    ],
    correctIndex: 2,
    explanation:
      "AWS Shield is a managed DDoS protection service. Shield Standard is automatically included at no extra cost for all AWS customers. Shield Advanced provides enhanced protections for EC2, ELB, CloudFront, Route 53, and AWS Global Accelerator.",
  },
  {
    id: "sc-04",
    domain: "Security & Compliance",
    question: "Which AWS service monitors your AWS account for malicious activity and unauthorized behavior using machine learning?",
    options: [
      "A. AWS Config",
      "B. Amazon Inspector",
      "C. Amazon GuardDuty",
      "D. AWS CloudTrail",
    ],
    correctIndex: 2,
    explanation:
      "Amazon GuardDuty is a threat detection service that continuously monitors for malicious activity and unauthorized behavior. It analyzes CloudTrail logs, VPC Flow Logs, and DNS logs using machine learning and threat intelligence.",
  },
  {
    id: "sc-05",
    domain: "Security & Compliance",
    question: "Which AWS service records API calls made in your AWS account for auditing purposes?",
    options: [
      "A. Amazon CloudWatch",
      "B. AWS CloudTrail",
      "C. AWS Config",
      "D. Amazon GuardDuty",
    ],
    correctIndex: 1,
    explanation:
      "AWS CloudTrail records all API calls made in your account, including who made the call, from which IP, and what was changed. It is the primary tool for auditing and compliance in AWS.",
  },
  {
    id: "sc-06",
    domain: "Security & Compliance",
    question: "A company needs to store and automatically rotate database passwords and API keys. Which AWS service should they use?",
    options: [
      "A. AWS KMS",
      "B. AWS Secrets Manager",
      "C. AWS IAM",
      "D. Amazon S3",
    ],
    correctIndex: 1,
    explanation:
      "AWS Secrets Manager helps you protect access to your applications, services, and IT resources by enabling you to rotate, manage, and retrieve database credentials, API keys, and other secrets throughout their lifecycle.",
  },
  {
    id: "sc-07",
    domain: "Security & Compliance",
    question: "Which AWS service provides a managed web application firewall to protect against common web exploits?",
    options: [
      "A. AWS Shield",
      "B. AWS WAF",
      "C. Amazon Inspector",
      "D. AWS Firewall Manager",
    ],
    correctIndex: 1,
    explanation:
      "AWS WAF (Web Application Firewall) lets you create rules to block common web exploits like SQL injection and cross-site scripting (XSS). It integrates with CloudFront, ALB, API Gateway, and AppSync.",
  },
  {
    id: "sc-08",
    domain: "Security & Compliance",
    question: "What is the recommended best practice for the AWS root account?",
    options: [
      "A. Use it for all daily administrative tasks",
      "B. Share it with the entire operations team",
      "C. Enable MFA and avoid using it for everyday tasks",
      "D. Delete it after creating IAM users",
    ],
    correctIndex: 2,
    explanation:
      "AWS strongly recommends enabling MFA on the root account and not using it for everyday tasks. Instead, create IAM users with appropriate permissions. The root account has unrestricted access and cannot be restricted by IAM policies.",
  },
  {
    id: "sc-09",
    domain: "Security & Compliance",
    question: "Which AWS service helps you assess, audit, and evaluate the configurations of your AWS resources for compliance?",
    options: [
      "A. AWS CloudTrail",
      "B. Amazon Inspector",
      "C. AWS Config",
      "D. AWS Trusted Advisor",
    ],
    correctIndex: 2,
    explanation:
      "AWS Config continuously monitors and records your AWS resource configurations and allows you to automate the evaluation of recorded configurations against desired configurations, helping with compliance auditing.",
  },
  {
    id: "sc-10",
    domain: "Security & Compliance",
    question: "Which AWS service provides automated security assessments of EC2 instances and container images for vulnerabilities?",
    options: [
      "A. Amazon GuardDuty",
      "B. AWS Security Hub",
      "C. Amazon Inspector",
      "D. AWS Config",
    ],
    correctIndex: 2,
    explanation:
      "Amazon Inspector automatically assesses applications for exposure, vulnerabilities, and deviations from best practices. It checks EC2 instances and ECR container images for software vulnerabilities and unintended network exposure.",
  },
  {
    id: "sc-11",
    domain: "Security & Compliance",
    question: "Which of the following is the customer's responsibility under the AWS Shared Responsibility Model for an EC2 instance?",
    options: [
      "A. Patching the hypervisor",
      "B. Securing the physical host hardware",
      "C. Patching the guest operating system",
      "D. Managing the underlying network infrastructure",
    ],
    correctIndex: 2,
    explanation:
      "For EC2 (IaaS), the customer is responsible for patching and maintaining the guest OS, installing and configuring applications, and managing security groups and firewall rules. AWS manages the hypervisor, physical hardware, and network infrastructure.",
  },
  {
    id: "sc-12",
    domain: "Security & Compliance",
    question: "Which AWS service provides a central view of security alerts and compliance status across AWS accounts?",
    options: [
      "A. AWS Config",
      "B. Amazon GuardDuty",
      "C. AWS Security Hub",
      "D. AWS Trusted Advisor",
    ],
    correctIndex: 2,
    explanation:
      "AWS Security Hub provides a comprehensive view of your security state in AWS and helps you check your environment against security industry standards and best practices. It aggregates findings from GuardDuty, Inspector, Macie, and other services.",
  },
  {
    id: "sc-13",
    domain: "Security & Compliance",
    question: "Which AWS service is used to create and manage encryption keys for your data?",
    options: [
      "A. AWS Secrets Manager",
      "B. AWS Certificate Manager",
      "C. AWS KMS",
      "D. AWS CloudHSM",
    ],
    correctIndex: 2,
    explanation:
      "AWS Key Management Service (KMS) makes it easy to create and manage cryptographic keys and control their use across AWS services and applications. It integrates with most AWS services that support encryption.",
  },
  {
    id: "sc-14",
    domain: "Security & Compliance",
    question: "What is multi-factor authentication (MFA) and why is it important in AWS?",
    options: [
      "A. A method to encrypt data at rest using multiple keys",
      "B. An extra layer of security requiring a second form of verification beyond a password",
      "C. A way to replicate data across multiple AWS Regions",
      "D. A compliance framework for financial services",
    ],
    correctIndex: 1,
    explanation:
      "MFA adds an extra layer of protection on top of a username and password. With MFA enabled, when a user signs in, they must provide their password plus a one-time code from a hardware or virtual MFA device, significantly reducing the risk of unauthorized access.",
  },
  {
    id: "sc-15",
    domain: "Security & Compliance",
    question: "Which AWS compliance program demonstrates that AWS meets the security requirements for handling US government data?",
    options: [
      "A. PCI DSS",
      "B. HIPAA",
      "C. FedRAMP",
      "D. SOC 2",
    ],
    correctIndex: 2,
    explanation:
      "FedRAMP (Federal Risk and Authorization Management Program) is a US government-wide program that provides a standardized approach to security assessment for cloud services used by federal agencies. AWS has FedRAMP authorization for many services.",
  },
  {
    id: "sc-16",
    domain: "Security & Compliance",
    question: "Which AWS service detects sensitive data such as PII stored in Amazon S3?",
    options: [
      "A. Amazon GuardDuty",
      "B. Amazon Macie",
      "C. AWS Config",
      "D. Amazon Inspector",
    ],
    correctIndex: 1,
    explanation:
      "Amazon Macie is a data security service that uses machine learning to automatically discover, classify, and protect sensitive data in Amazon S3. It can identify PII, financial data, and other sensitive information.",
  },

  // ── Technology ──────────────────────────────────────────────────────────────
  {
    id: "tech-01",
    domain: "Technology",
    question: "Which AWS service provides scalable object storage for any type of data?",
    options: [
      "A. Amazon EBS",
      "B. Amazon EFS",
      "C. Amazon S3",
      "D. Amazon Glacier",
    ],
    correctIndex: 2,
    explanation:
      "Amazon S3 (Simple Storage Service) is an object storage service offering industry-leading scalability, data availability, security, and performance. It stores data as objects in buckets and is designed for 99.999999999% (11 nines) durability.",
  },
  {
    id: "tech-02",
    domain: "Technology",
    question: "Which AWS compute service lets you run code without provisioning or managing servers?",
    options: [
      "A. Amazon EC2",
      "B. Amazon ECS",
      "C. AWS Lambda",
      "D. AWS Elastic Beanstalk",
    ],
    correctIndex: 2,
    explanation:
      "AWS Lambda is a serverless compute service that runs your code in response to events and automatically manages the underlying compute resources. You pay only for the compute time consumed — there is no charge when your code is not running.",
  },
  {
    id: "tech-03",
    domain: "Technology",
    question: "Which AWS service is a managed relational database service that supports MySQL, PostgreSQL, and Oracle?",
    options: [
      "A. Amazon DynamoDB",
      "B. Amazon RDS",
      "C. Amazon Redshift",
      "D. Amazon ElastiCache",
    ],
    correctIndex: 1,
    explanation:
      "Amazon RDS (Relational Database Service) makes it easy to set up, operate, and scale a relational database in the cloud. It supports Amazon Aurora, MySQL, MariaDB, PostgreSQL, Oracle, and SQL Server.",
  },
  {
    id: "tech-04",
    domain: "Technology",
    question: "Which AWS service is a fully managed NoSQL key-value and document database?",
    options: [
      "A. Amazon RDS",
      "B. Amazon Redshift",
      "C. Amazon DynamoDB",
      "D. Amazon Aurora",
    ],
    correctIndex: 2,
    explanation:
      "Amazon DynamoDB is a fully managed, serverless, key-value NoSQL database designed to run high-performance applications at any scale. It offers single-digit millisecond performance and automatic scaling.",
  },
  {
    id: "tech-05",
    domain: "Technology",
    question: "Which AWS service is used to distribute content globally with low latency using a network of edge locations?",
    options: [
      "A. AWS Global Accelerator",
      "B. Amazon CloudFront",
      "C. Amazon Route 53",
      "D. AWS Direct Connect",
    ],
    correctIndex: 1,
    explanation:
      "Amazon CloudFront is a fast content delivery network (CDN) service that securely delivers data, videos, applications, and APIs to customers globally with low latency and high transfer speeds using a global network of edge locations.",
  },
  {
    id: "tech-06",
    domain: "Technology",
    question: "Which AWS service provides scalable DNS and domain name registration?",
    options: [
      "A. Amazon CloudFront",
      "B. AWS Global Accelerator",
      "C. Amazon Route 53",
      "D. AWS Direct Connect",
    ],
    correctIndex: 2,
    explanation:
      "Amazon Route 53 is a highly available and scalable cloud Domain Name System (DNS) web service. It can also perform health checking and route traffic based on various routing policies (latency, geolocation, failover, etc.).",
  },
  {
    id: "tech-07",
    domain: "Technology",
    question: "Which AWS service provides a virtual private network isolated from other AWS customers?",
    options: [
      "A. AWS Direct Connect",
      "B. Amazon VPC",
      "C. AWS Transit Gateway",
      "D. AWS PrivateLink",
    ],
    correctIndex: 1,
    explanation:
      "Amazon VPC (Virtual Private Cloud) lets you provision a logically isolated section of the AWS Cloud where you can launch AWS resources in a virtual network that you define. You have complete control over your virtual networking environment.",
  },
  {
    id: "tech-08",
    domain: "Technology",
    question: "Which AWS service automatically distributes incoming application traffic across multiple targets such as EC2 instances?",
    options: [
      "A. Amazon Route 53",
      "B. AWS Auto Scaling",
      "C. Elastic Load Balancing",
      "D. Amazon CloudFront",
    ],
    correctIndex: 2,
    explanation:
      "Elastic Load Balancing (ELB) automatically distributes incoming application traffic across multiple targets — EC2 instances, containers, IP addresses, and Lambda functions — in one or more Availability Zones.",
  },
  {
    id: "tech-09",
    domain: "Technology",
    question: "Which AWS service provides block storage volumes for use with EC2 instances?",
    options: [
      "A. Amazon S3",
      "B. Amazon EFS",
      "C. Amazon EBS",
      "D. AWS Storage Gateway",
    ],
    correctIndex: 2,
    explanation:
      "Amazon EBS (Elastic Block Store) provides persistent block storage volumes for use with Amazon EC2 instances. EBS volumes behave like raw, unformatted block devices and can be used as a boot volume or data volume.",
  },
  {
    id: "tech-10",
    domain: "Technology",
    question: "Which AWS service provides a fully managed message queuing service that decouples microservices?",
    options: [
      "A. Amazon SNS",
      "B. Amazon SQS",
      "C. Amazon Kinesis",
      "D. AWS EventBridge",
    ],
    correctIndex: 1,
    explanation:
      "Amazon SQS (Simple Queue Service) is a fully managed message queuing service that enables you to decouple and scale microservices, distributed systems, and serverless applications. Messages are stored until they are processed and deleted.",
  },
  {
    id: "tech-11",
    domain: "Technology",
    question: "Which AWS service sends notifications via email, SMS, or HTTP endpoints using a publish/subscribe model?",
    options: [
      "A. Amazon SQS",
      "B. Amazon SES",
      "C. Amazon SNS",
      "D. AWS EventBridge",
    ],
    correctIndex: 2,
    explanation:
      "Amazon SNS (Simple Notification Service) is a fully managed pub/sub messaging service. Publishers send messages to topics, and SNS delivers those messages to all subscribed endpoints including email, SMS, Lambda, SQS, and HTTP.",
  },
  {
    id: "tech-12",
    domain: "Technology",
    question: "Which AWS service provides monitoring and observability for AWS resources and applications?",
    options: [
      "A. AWS CloudTrail",
      "B. Amazon CloudWatch",
      "C. AWS Config",
      "D. AWS X-Ray",
    ],
    correctIndex: 1,
    explanation:
      "Amazon CloudWatch is a monitoring and observability service that collects metrics, logs, and events from AWS resources and applications. You can set alarms, visualize logs, and automatically react to changes in your AWS resources.",
  },
  {
    id: "tech-13",
    domain: "Technology",
    question: "Which AWS service allows you to provision infrastructure using code (Infrastructure as Code)?",
    options: [
      "A. AWS Elastic Beanstalk",
      "B. AWS OpsWorks",
      "C. AWS CloudFormation",
      "D. AWS Systems Manager",
    ],
    correctIndex: 2,
    explanation:
      "AWS CloudFormation provides a common language to model and provision AWS and third-party application resources in your cloud environment using templates (JSON or YAML). It enables Infrastructure as Code (IaC).",
  },
  {
    id: "tech-14",
    domain: "Technology",
    question: "Which AWS database service is best suited for a data warehouse and running complex analytical queries on large datasets?",
    options: [
      "A. Amazon RDS",
      "B. Amazon DynamoDB",
      "C. Amazon Redshift",
      "D. Amazon Aurora",
    ],
    correctIndex: 2,
    explanation:
      "Amazon Redshift is a fully managed, petabyte-scale data warehouse service. It is optimized for OLAP (Online Analytical Processing) workloads and can run complex analytical queries against large datasets using columnar storage.",
  },
  {
    id: "tech-15",
    domain: "Technology",
    question: "Which AWS service provides a managed container orchestration service compatible with Kubernetes?",
    options: [
      "A. Amazon ECS",
      "B. Amazon EKS",
      "C. AWS Fargate",
      "D. AWS Lambda",
    ],
    correctIndex: 1,
    explanation:
      "Amazon EKS (Elastic Kubernetes Service) is a fully managed Kubernetes service. It runs upstream Kubernetes and is certified Kubernetes conformant, so you can use existing Kubernetes tooling and plugins.",
  },
  {
    id: "tech-16",
    domain: "Technology",
    question: "Which AWS service lets you run containers without managing servers or clusters?",
    options: [
      "A. Amazon ECS with EC2 launch type",
      "B. Amazon EKS with self-managed nodes",
      "C. AWS Fargate",
      "D. Amazon EC2",
    ],
    correctIndex: 2,
    explanation:
      "AWS Fargate is a serverless compute engine for containers that works with both Amazon ECS and Amazon EKS. With Fargate, you don't need to provision, configure, or scale clusters of virtual machines to run containers.",
  },
  {
    id: "tech-17",
    domain: "Technology",
    question: "Which AWS service provides a managed in-memory caching service to improve application performance?",
    options: [
      "A. Amazon RDS",
      "B. Amazon DynamoDB Accelerator (DAX)",
      "C. Amazon ElastiCache",
      "D. Amazon Redshift",
    ],
    correctIndex: 2,
    explanation:
      "Amazon ElastiCache is a fully managed in-memory caching service supporting Redis and Memcached. It improves application performance by retrieving data from fast, managed, in-memory caches instead of slower disk-based databases.",
  },
  {
    id: "tech-18",
    domain: "Technology",
    question: "Which AWS service provides a managed file system that can be mounted on multiple EC2 instances simultaneously?",
    options: [
      "A. Amazon EBS",
      "B. Amazon S3",
      "C. Amazon EFS",
      "D. AWS Storage Gateway",
    ],
    correctIndex: 2,
    explanation:
      "Amazon EFS (Elastic File System) provides a simple, scalable, fully managed elastic NFS file system. Unlike EBS (which attaches to a single instance), EFS can be mounted by thousands of EC2 instances simultaneously.",
  },

  // ── Billing & Pricing ───────────────────────────────────────────────────────
  {
    id: "bp-01",
    domain: "Billing & Pricing",
    question: "Which AWS pricing model provides the largest discount in exchange for a 1- or 3-year commitment?",
    options: [
      "A. On-Demand Instances",
      "B. Spot Instances",
      "C. Reserved Instances",
      "D. Dedicated Hosts",
    ],
    correctIndex: 2,
    explanation:
      "Reserved Instances provide a significant discount (up to 72%) compared to On-Demand pricing in exchange for a 1- or 3-year commitment. They are ideal for steady-state workloads with predictable usage.",
  },
  {
    id: "bp-02",
    domain: "Billing & Pricing",
    question: "Which EC2 pricing option is best for fault-tolerant, flexible workloads that can be interrupted?",
    options: [
      "A. On-Demand Instances",
      "B. Reserved Instances",
      "C. Spot Instances",
      "D. Dedicated Instances",
    ],
    correctIndex: 2,
    explanation:
      "Spot Instances let you take advantage of unused EC2 capacity at up to 90% discount compared to On-Demand prices. However, AWS can reclaim them with a 2-minute warning, so they are best for fault-tolerant, stateless, or batch workloads.",
  },
  {
    id: "bp-03",
    domain: "Billing & Pricing",
    question: "Which AWS tool provides a detailed breakdown of your AWS costs and usage over time?",
    options: [
      "A. AWS Pricing Calculator",
      "B. AWS Cost Explorer",
      "C. AWS Budgets",
      "D. AWS Trusted Advisor",
    ],
    correctIndex: 1,
    explanation:
      "AWS Cost Explorer is a tool that lets you visualize, understand, and manage your AWS costs and usage over time. It provides pre-built reports and lets you create custom reports to analyze cost and usage data.",
  },
  {
    id: "bp-04",
    domain: "Billing & Pricing",
    question: "Which AWS service lets you set custom cost and usage thresholds and receive alerts when they are exceeded?",
    options: [
      "A. AWS Cost Explorer",
      "B. AWS Pricing Calculator",
      "C. AWS Budgets",
      "D. AWS Cost and Usage Report",
    ],
    correctIndex: 2,
    explanation:
      "AWS Budgets allows you to set custom budgets that alert you when your costs or usage exceed (or are forecasted to exceed) your budgeted amount. You can set budgets for cost, usage, reservation utilization, and Savings Plans.",
  },
  {
    id: "bp-05",
    domain: "Billing & Pricing",
    question: "Which AWS tool helps you estimate the cost of a new AWS architecture before you build it?",
    options: [
      "A. AWS Cost Explorer",
      "B. AWS Budgets",
      "C. AWS Pricing Calculator",
      "D. AWS Trusted Advisor",
    ],
    correctIndex: 2,
    explanation:
      "The AWS Pricing Calculator lets you explore AWS services and create an estimate for the cost of your use cases on AWS. It is useful for planning new architectures or migrating workloads to AWS.",
  },
  {
    id: "bp-06",
    domain: "Billing & Pricing",
    question: "Which AWS support plan provides a Technical Account Manager (TAM)?",
    options: [
      "A. Basic",
      "B. Developer",
      "C. Business",
      "D. Enterprise",
    ],
    correctIndex: 3,
    explanation:
      "A Technical Account Manager (TAM) is only available with the AWS Enterprise Support plan. The TAM serves as your primary point of contact, providing proactive guidance and advocacy within AWS.",
  },
  {
    id: "bp-07",
    domain: "Billing & Pricing",
    question: "Which AWS service provides recommendations to help reduce costs, improve performance, and enhance security?",
    options: [
      "A. AWS Config",
      "B. Amazon CloudWatch",
      "C. AWS Trusted Advisor",
      "D. AWS Cost Explorer",
    ],
    correctIndex: 2,
    explanation:
      "AWS Trusted Advisor is an online tool that provides real-time guidance to help you provision your resources following AWS best practices across five categories: cost optimization, performance, security, fault tolerance, and service limits.",
  },
  {
    id: "bp-08",
    domain: "Billing & Pricing",
    question: "Which AWS pricing model offers a discount of up to 66% in exchange for a commitment to a consistent amount of compute usage (measured in $/hour) for 1 or 3 years?",
    options: [
      "A. Reserved Instances",
      "B. Spot Instances",
      "C. Savings Plans",
      "D. Dedicated Hosts",
    ],
    correctIndex: 2,
    explanation:
      "Savings Plans offer significant savings over On-Demand pricing in exchange for a commitment to a consistent amount of usage ($/hour) for 1 or 3 years. They are more flexible than Reserved Instances as they apply automatically across EC2, Lambda, and Fargate.",
  },
  {
    id: "bp-09",
    domain: "Billing & Pricing",
    question: "What is the AWS Free Tier?",
    options: [
      "A. A permanent free tier for all AWS services with no limits",
      "B. A set of offers that allow new AWS customers to use certain services for free up to specified limits",
      "C. A discount program for non-profit organizations",
      "D. A free support plan included with all AWS accounts",
    ],
    correctIndex: 1,
    explanation:
      "The AWS Free Tier provides new AWS customers with free usage of certain services up to specified limits for 12 months (e.g., 750 hours/month of EC2 t2.micro), plus some services that are always free (e.g., 1 million Lambda requests/month).",
  },
  {
    id: "bp-10",
    domain: "Billing & Pricing",
    question: "Which AWS feature allows you to consolidate billing across multiple AWS accounts and receive volume discounts?",
    options: [
      "A. AWS Cost Explorer",
      "B. AWS Organizations",
      "C. AWS Control Tower",
      "D. AWS Service Catalog",
    ],
    correctIndex: 1,
    explanation:
      "AWS Organizations allows you to consolidate multiple AWS accounts into an organization. With consolidated billing, you can combine usage across all accounts to receive volume pricing discounts, and you get a single bill for all accounts.",
  },
  {
    id: "bp-11",
    domain: "Billing & Pricing",
    question: "Which of the following AWS services is always free, regardless of usage?",
    options: [
      "A. Amazon EC2",
      "B. Amazon S3",
      "C. AWS IAM",
      "D. Amazon RDS",
    ],
    correctIndex: 2,
    explanation:
      "AWS IAM is always free — there is no charge for creating users, groups, roles, or policies. Other services like EC2, S3, and RDS have free tier limits but are not always free.",
  },
  {
    id: "bp-12",
    domain: "Billing & Pricing",
    question: "A company wants to run a physical server in an AWS data center that is dedicated solely to their use for licensing compliance. Which EC2 option should they use?",
    options: [
      "A. Reserved Instances",
      "B. Dedicated Instances",
      "C. Dedicated Hosts",
      "D. Spot Instances",
    ],
    correctIndex: 2,
    explanation:
      "Dedicated Hosts are physical EC2 servers dedicated for your use. They allow you to use your existing server-bound software licenses (e.g., Windows Server, SQL Server) and can help you meet compliance requirements.",
  },
  {
    id: "bp-13",
    domain: "Billing & Pricing",
    question: "Which AWS support plan is the minimum level that provides 24/7 access to Cloud Support Engineers via phone, chat, and email?",
    options: [
      "A. Basic",
      "B. Developer",
      "C. Business",
      "D. Enterprise",
    ],
    correctIndex: 2,
    explanation:
      "The Business support plan is the minimum level that provides 24/7 access to Cloud Support Engineers via phone, chat, and email. Developer plan only provides business-hours email access to Cloud Support Associates.",
  },
  {
    id: "bp-14",
    domain: "Billing & Pricing",
    question: "Which AWS report provides the most granular data about your AWS costs and usage, suitable for loading into a data warehouse?",
    options: [
      "A. AWS Cost Explorer",
      "B. AWS Budgets",
      "C. AWS Cost and Usage Report (CUR)",
      "D. AWS Trusted Advisor",
    ],
    correctIndex: 2,
    explanation:
      "The AWS Cost and Usage Report (CUR) contains the most comprehensive set of cost and usage data available. It can be delivered to S3 and loaded into Redshift, Athena, or QuickSight for detailed analysis.",
  },
  {
    id: "bp-15",
    domain: "Billing & Pricing",
    question: "Which of the following does NOT incur a cost in Amazon S3?",
    options: [
      "A. Storing 100 GB of data in S3",
      "B. Transferring data INTO S3 from the internet",
      "C. Making 1 million GET requests",
      "D. Transferring data OUT of S3 to the internet",
    ],
    correctIndex: 1,
    explanation:
      "Data transfer INTO Amazon S3 from the internet is free. You are charged for storage (per GB/month), requests (GET, PUT, etc.), and data transferred OUT of S3 to the internet or other AWS Regions.",
  },

  // ── Cloud Concepts (extra) ──────────────────────────────────────────────────
  {
    id: "cc-17",
    domain: "Cloud Concepts",
    question: "Which of the following describes the concept of 'high availability' in AWS?",
    options: [
      "A. The ability to scale resources up or down automatically",
      "B. Designing systems to remain operational with minimal downtime",
      "C. Storing data in multiple geographic regions",
      "D. Using spot instances to reduce costs",
    ],
    correctIndex: 1,
    explanation: "High availability means designing systems to minimize downtime and remain operational. In AWS this is achieved by deploying across multiple Availability Zones so that if one AZ fails, traffic is automatically routed to healthy AZs.",
  },
  {
    id: "cc-18",
    domain: "Cloud Concepts",
    question: "What is the purpose of an AWS Local Zone?",
    options: [
      "A. To provide a dedicated physical server for a single customer",
      "B. To extend AWS infrastructure closer to large population centers for ultra-low latency",
      "C. To connect on-premises data centers to AWS via a private link",
      "D. To replicate data across multiple AWS Regions automatically",
    ],
    correctIndex: 1,
    explanation: "AWS Local Zones place compute, storage, database, and other select AWS services closer to large population and industry centers, enabling applications that require single-digit millisecond latency to end users.",
  },
  {
    id: "cc-19",
    domain: "Cloud Concepts",
    question: "Which AWS service allows you to run AWS infrastructure and services on-premises?",
    options: [
      "A. AWS Direct Connect",
      "B. AWS Outposts",
      "C. AWS Wavelength",
      "D. AWS Local Zones",
    ],
    correctIndex: 1,
    explanation: "AWS Outposts brings native AWS services, infrastructure, and operating models to virtually any data center, co-location space, or on-premises facility. It allows you to run AWS compute and storage locally.",
  },
  {
    id: "cc-20",
    domain: "Cloud Concepts",
    question: "A company is migrating to AWS and wants to move existing virtual machines with minimal changes. Which migration strategy does this represent?",
    options: [
      "A. Re-architect",
      "B. Re-platform",
      "C. Rehost (lift and shift)",
      "D. Retire",
    ],
    correctIndex: 2,
    explanation: "Rehosting (lift and shift) means moving applications to AWS without making any changes. It is the fastest migration strategy and is often used as a first step before optimizing for the cloud.",
  },
  {
    id: "cc-21",
    domain: "Cloud Concepts",
    question: "Which of the following is a benefit of using managed services like Amazon RDS over self-managed databases on EC2?",
    options: [
      "A. You have full control over the database engine version",
      "B. AWS handles patching, backups, and replication automatically",
      "C. Managed services are always cheaper than self-managed",
      "D. You can install any custom software on the database server",
    ],
    correctIndex: 1,
    explanation: "With managed services like RDS, AWS handles undifferentiated heavy lifting such as OS patching, database patching, automated backups, and Multi-AZ replication, freeing you to focus on your application.",
  },
  {
    id: "cc-22",
    domain: "Cloud Concepts",
    question: "What does 'fault tolerance' mean in the context of AWS architecture?",
    options: [
      "A. The system can scale to handle any amount of traffic",
      "B. The system continues operating properly even when some components fail",
      "C. The system automatically reduces costs during low-traffic periods",
      "D. The system encrypts all data at rest and in transit",
    ],
    correctIndex: 1,
    explanation: "Fault tolerance is the ability of a system to continue operating without interruption when one or more of its components fail. In AWS, this is achieved through redundancy across multiple AZs and services like ELB and Auto Scaling.",
  },
  {
    id: "cc-23",
    domain: "Cloud Concepts",
    question: "Which AWS concept refers to the practice of designing systems that can handle the failure of individual components without affecting the overall system?",
    options: [
      "A. Elasticity",
      "B. Loose coupling",
      "C. Design for failure",
      "D. Economies of scale",
    ],
    correctIndex: 2,
    explanation: "Design for failure is an AWS best practice that means assuming components will fail and building systems that can tolerate those failures. This includes using multiple AZs, health checks, and automatic failover.",
  },
  {
    id: "cc-24",
    domain: "Cloud Concepts",
    question: "Which of the following is an example of 'loose coupling' in AWS architecture?",
    options: [
      "A. Connecting two EC2 instances directly via a private IP address",
      "B. Using Amazon SQS between application tiers so they can scale independently",
      "C. Deploying all application components on a single large EC2 instance",
      "D. Using a single database for all application microservices",
    ],
    correctIndex: 1,
    explanation: "Loose coupling means designing components so they interact through well-defined interfaces and can operate independently. Using SQS between tiers means each tier can scale, fail, or be updated without directly impacting the other.",
  },
  {
    id: "cc-25",
    domain: "Cloud Concepts",
    question: "What is the AWS Well-Architected Framework?",
    options: [
      "A. A set of AWS pricing tiers for enterprise customers",
      "B. A framework of best practices for designing reliable, secure, efficient, and cost-effective cloud architectures",
      "C. A compliance certification program for AWS partners",
      "D. A tool for automatically deploying infrastructure on AWS",
    ],
    correctIndex: 1,
    explanation: "The AWS Well-Architected Framework provides a consistent approach for evaluating architectures and implementing designs that scale over time. It is organized into six pillars: Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, and Sustainability.",
  },
  {
    id: "cc-26",
    domain: "Cloud Concepts",
    question: "Which AWS service provides a catalog of IT services approved for use on AWS within an organization?",
    options: [
      "A. AWS Marketplace",
      "B. AWS Service Catalog",
      "C. AWS Organizations",
      "D. AWS Config",
    ],
    correctIndex: 1,
    explanation: "AWS Service Catalog allows organizations to create and manage catalogs of IT services that are approved for use on AWS. It helps organizations achieve consistent governance and meet compliance requirements.",
  },
  {
    id: "cc-27",
    domain: "Cloud Concepts",
    question: "Which of the following best describes 'serverless' computing on AWS?",
    options: [
      "A. Running workloads on physical servers you own",
      "B. Running code without provisioning or managing servers; AWS handles all infrastructure",
      "C. Using dedicated hosts with no shared tenancy",
      "D. Deploying containers on self-managed Kubernetes clusters",
    ],
    correctIndex: 1,
    explanation: "Serverless computing means you write and deploy code without thinking about servers. AWS Lambda is the primary serverless compute service — you pay only for execution time and AWS automatically scales, patches, and manages the infrastructure.",
  },
  {
    id: "cc-28",
    domain: "Cloud Concepts",
    question: "What is the primary purpose of AWS CloudFormation StackSets?",
    options: [
      "A. To deploy a single CloudFormation stack across multiple Regions and accounts simultaneously",
      "B. To monitor CloudFormation stack drift",
      "C. To estimate the cost of a CloudFormation template",
      "D. To convert CloudFormation templates to Terraform",
    ],
    correctIndex: 0,
    explanation: "AWS CloudFormation StackSets extends the functionality of stacks by enabling you to create, update, or delete stacks across multiple accounts and Regions with a single operation, making it ideal for multi-account governance.",
  },

  // ── Security & Compliance (extra) ──────────────────────────────────────────
  {
    id: "sc-17",
    domain: "Security & Compliance",
    question: "Which AWS service provides a single place to manage firewall rules across multiple AWS accounts and resources?",
    options: [
      "A. AWS WAF",
      "B. AWS Shield",
      "C. AWS Firewall Manager",
      "D. Amazon GuardDuty",
    ],
    correctIndex: 2,
    explanation: "AWS Firewall Manager is a security management service that allows you to centrally configure and manage firewall rules across your accounts and applications in AWS Organizations, including AWS WAF rules, Shield Advanced protections, and VPC security groups.",
  },
  {
    id: "sc-18",
    domain: "Security & Compliance",
    question: "What is an IAM role?",
    options: [
      "A. A permanent set of credentials assigned to an IAM user",
      "B. An identity with permissions that can be assumed by trusted entities such as EC2 instances or Lambda functions",
      "C. A group of IAM users with shared permissions",
      "D. A policy that denies all access by default",
    ],
    correctIndex: 1,
    explanation: "An IAM role is an identity you can create that has specific permissions. Unlike users, roles do not have long-term credentials. Instead, they provide temporary security credentials when assumed by trusted entities like EC2 instances, Lambda functions, or other AWS services.",
  },
  {
    id: "sc-19",
    domain: "Security & Compliance",
    question: "Which AWS service provides hardware security modules (HSMs) in the cloud for generating and managing your own encryption keys?",
    options: [
      "A. AWS KMS",
      "B. AWS CloudHSM",
      "C. AWS Secrets Manager",
      "D. AWS Certificate Manager",
    ],
    correctIndex: 1,
    explanation: "AWS CloudHSM provides dedicated hardware security modules in the AWS Cloud. Unlike KMS (which is a shared, managed service), CloudHSM gives you exclusive, single-tenant access to HSM hardware for strict compliance requirements.",
  },
  {
    id: "sc-20",
    domain: "Security & Compliance",
    question: "Which AWS service manages SSL/TLS certificates for use with AWS services like CloudFront and ALB?",
    options: [
      "A. AWS KMS",
      "B. AWS Secrets Manager",
      "C. AWS Certificate Manager",
      "D. AWS CloudHSM",
    ],
    correctIndex: 2,
    explanation: "AWS Certificate Manager (ACM) handles the complexity of creating, storing, and renewing public and private SSL/TLS certificates. Certificates provisioned through ACM for use with AWS services are free.",
  },
  {
    id: "sc-21",
    domain: "Security & Compliance",
    question: "A company needs to ensure their AWS workloads comply with PCI DSS. Which AWS tool provides a compliance report for this standard?",
    options: [
      "A. AWS Config",
      "B. AWS Artifact",
      "C. AWS Security Hub",
      "D. Amazon Inspector",
    ],
    correctIndex: 1,
    explanation: "AWS Artifact is a self-service portal for on-demand access to AWS compliance reports and agreements. It provides access to AWS security and compliance documents such as SOC reports, PCI DSS attestations, and ISO certifications.",
  },
  {
    id: "sc-22",
    domain: "Security & Compliance",
    question: "Which of the following is a security best practice for IAM?",
    options: [
      "A. Attach permissions directly to IAM users for simplicity",
      "B. Use the root account for all daily operations",
      "C. Grant permissions using IAM groups and roles rather than individual users",
      "D. Share IAM user credentials across team members",
    ],
    correctIndex: 2,
    explanation: "AWS best practice is to manage permissions at the group or role level rather than attaching policies to individual users. This makes permissions easier to manage, audit, and revoke when someone leaves the team.",
  },
  {
    id: "sc-23",
    domain: "Security & Compliance",
    question: "What is a VPC Security Group?",
    options: [
      "A. A stateless firewall that filters traffic at the subnet level",
      "B. A stateful virtual firewall that controls inbound and outbound traffic for EC2 instances",
      "C. A service that monitors VPC traffic for threats",
      "D. A policy that restricts which AWS services can be used in a VPC",
    ],
    correctIndex: 1,
    explanation: "A Security Group acts as a stateful virtual firewall for EC2 instances. Stateful means if you allow inbound traffic, the response is automatically allowed outbound. Security Groups operate at the instance level and only support allow rules.",
  },
  {
    id: "sc-24",
    domain: "Security & Compliance",
    question: "What is a Network ACL (NACL) in AWS?",
    options: [
      "A. A stateful firewall at the instance level",
      "B. A stateless firewall at the subnet level that supports both allow and deny rules",
      "C. A managed DDoS protection service",
      "D. A tool for monitoring network traffic patterns",
    ],
    correctIndex: 1,
    explanation: "A Network ACL is a stateless firewall that controls traffic in and out of subnets. Unlike Security Groups, NACLs support both allow and deny rules and evaluate rules in order by rule number. Because they are stateless, you must explicitly allow both inbound and outbound traffic.",
  },
  {
    id: "sc-25",
    domain: "Security & Compliance",
    question: "Which AWS service provides centralized governance and management across multiple AWS accounts?",
    options: [
      "A. AWS IAM",
      "B. AWS Control Tower",
      "C. AWS Config",
      "D. AWS Service Catalog",
    ],
    correctIndex: 1,
    explanation: "AWS Control Tower provides the easiest way to set up and govern a secure, multi-account AWS environment based on AWS best practices. It automates the setup of a landing zone and applies guardrails (preventive and detective controls) across accounts.",
  },
  {
    id: "sc-26",
    domain: "Security & Compliance",
    question: "Which AWS feature allows you to set permission guardrails across all accounts in an AWS Organization?",
    options: [
      "A. IAM Permission Boundaries",
      "B. Service Control Policies (SCPs)",
      "C. Resource-based policies",
      "D. AWS Config Rules",
    ],
    correctIndex: 1,
    explanation: "Service Control Policies (SCPs) are a type of organization policy that you can use to manage permissions in AWS Organizations. SCPs set the maximum permissions for member accounts, acting as guardrails that restrict what actions can be performed even by account administrators.",
  },
  {
    id: "sc-27",
    domain: "Security & Compliance",
    question: "Which AWS service provides a managed threat intelligence feed and integrates with GuardDuty to identify known malicious IPs?",
    options: [
      "A. AWS Security Hub",
      "B. Amazon Detective",
      "C. AWS Shield Advanced",
      "D. Amazon GuardDuty",
    ],
    correctIndex: 3,
    explanation: "Amazon GuardDuty uses built-in threat intelligence feeds, including lists of known malicious IP addresses and domains, combined with machine learning to identify unexpected and potentially unauthorized activity in your AWS environment.",
  },
  {
    id: "sc-28",
    domain: "Security & Compliance",
    question: "Which AWS service helps you investigate security findings and understand the root cause of potential security issues?",
    options: [
      "A. Amazon GuardDuty",
      "B. Amazon Detective",
      "C. AWS Security Hub",
      "D. Amazon Inspector",
    ],
    correctIndex: 1,
    explanation: "Amazon Detective automatically collects log data from your AWS resources and uses machine learning, statistical analysis, and graph theory to help you visualize and investigate security issues. It is used for root cause analysis after a finding is identified.",
  },

  // ── Technology (extra) ──────────────────────────────────────────────────────
  {
    id: "tech-19",
    domain: "Technology",
    question: "Which AWS service provides a fully managed graph database?",
    options: [
      "A. Amazon DynamoDB",
      "B. Amazon Neptune",
      "C. Amazon DocumentDB",
      "D. Amazon Keyspaces",
    ],
    correctIndex: 1,
    explanation: "Amazon Neptune is a fully managed graph database service that supports popular graph models Property Graph and RDF. It is optimized for storing and querying highly connected data such as social networks, recommendation engines, and fraud detection.",
  },
  {
    id: "tech-20",
    domain: "Technology",
    question: "Which AWS service is a fully managed document database compatible with MongoDB?",
    options: [
      "A. Amazon DynamoDB",
      "B. Amazon Neptune",
      "C. Amazon DocumentDB",
      "D. Amazon RDS",
    ],
    correctIndex: 2,
    explanation: "Amazon DocumentDB (with MongoDB compatibility) is a fully managed document database service that supports MongoDB workloads. It is designed to be fast, scalable, and highly available.",
  },
  {
    id: "tech-21",
    domain: "Technology",
    question: "Which AWS service provides a high-performance, MySQL and PostgreSQL-compatible relational database with up to 5x the throughput of standard MySQL?",
    options: [
      "A. Amazon RDS for MySQL",
      "B. Amazon Aurora",
      "C. Amazon Redshift",
      "D. Amazon DynamoDB",
    ],
    correctIndex: 1,
    explanation: "Amazon Aurora is a MySQL and PostgreSQL-compatible relational database built for the cloud. It delivers up to 5x the throughput of standard MySQL and 3x the throughput of standard PostgreSQL, with automatic storage scaling up to 128 TB.",
  },
  {
    id: "tech-22",
    domain: "Technology",
    question: "Which AWS service provides a managed Apache Kafka service for real-time streaming data?",
    options: [
      "A. Amazon SQS",
      "B. Amazon Kinesis",
      "C. Amazon MSK",
      "D. AWS EventBridge",
    ],
    correctIndex: 2,
    explanation: "Amazon MSK (Managed Streaming for Apache Kafka) is a fully managed service that makes it easy to build and run applications that use Apache Kafka to process streaming data.",
  },
  {
    id: "tech-23",
    domain: "Technology",
    question: "Which AWS service is used to collect, process, and analyze real-time streaming data at scale?",
    options: [
      "A. Amazon SQS",
      "B. Amazon Kinesis",
      "C. Amazon SNS",
      "D. AWS Glue",
    ],
    correctIndex: 1,
    explanation: "Amazon Kinesis makes it easy to collect, process, and analyze real-time streaming data. Kinesis Data Streams captures gigabytes of data per second from hundreds of thousands of sources.",
  },
  {
    id: "tech-24",
    domain: "Technology",
    question: "Which AWS service provides a serverless ETL (Extract, Transform, Load) service for preparing data for analytics?",
    options: [
      "A. Amazon EMR",
      "B. AWS Glue",
      "C. Amazon Athena",
      "D. Amazon Redshift",
    ],
    correctIndex: 1,
    explanation: "AWS Glue is a fully managed serverless ETL service that makes it easy to discover, prepare, and combine data for analytics, machine learning, and application development. It includes a data catalog and can auto-generate ETL code.",
  },
  {
    id: "tech-25",
    domain: "Technology",
    question: "Which AWS service allows you to query data directly in Amazon S3 using standard SQL without loading it into a database?",
    options: [
      "A. Amazon Redshift",
      "B. AWS Glue",
      "C. Amazon Athena",
      "D. Amazon EMR",
    ],
    correctIndex: 2,
    explanation: "Amazon Athena is an interactive query service that makes it easy to analyze data in Amazon S3 using standard SQL. It is serverless, so there is no infrastructure to manage, and you pay only for the queries you run.",
  },
  {
    id: "tech-26",
    domain: "Technology",
    question: "Which AWS service provides a managed business intelligence service for creating dashboards and visualizations?",
    options: [
      "A. Amazon Athena",
      "B. Amazon QuickSight",
      "C. AWS Glue",
      "D. Amazon Redshift",
    ],
    correctIndex: 1,
    explanation: "Amazon QuickSight is a cloud-native, serverless business intelligence service. It allows you to create and publish interactive dashboards and visualizations, and can connect to many AWS data sources.",
  },
  {
    id: "tech-27",
    domain: "Technology",
    question: "Which AWS service provides a managed workflow service for coordinating distributed application components?",
    options: [
      "A. Amazon SQS",
      "B. AWS Step Functions",
      "C. Amazon SNS",
      "D. AWS EventBridge",
    ],
    correctIndex: 1,
    explanation: "AWS Step Functions is a serverless orchestration service that lets you coordinate multiple AWS services into serverless workflows. You can design and run workflows that stitch together services such as Lambda, ECS, and DynamoDB.",
  },
  {
    id: "tech-28",
    domain: "Technology",
    question: "Which AWS service provides a fully managed CI/CD pipeline service?",
    options: [
      "A. AWS CodeBuild",
      "B. AWS CodeDeploy",
      "C. AWS CodePipeline",
      "D. AWS CodeCommit",
    ],
    correctIndex: 2,
    explanation: "AWS CodePipeline is a fully managed continuous delivery service that helps you automate your release pipelines for fast and reliable application and infrastructure updates. It orchestrates CodeCommit, CodeBuild, and CodeDeploy.",
  },
  {
    id: "tech-29",
    domain: "Technology",
    question: "Which AWS service provides a managed source control service based on Git?",
    options: [
      "A. AWS CodePipeline",
      "B. AWS CodeBuild",
      "C. AWS CodeCommit",
      "D. AWS CodeDeploy",
    ],
    correctIndex: 2,
    explanation: "AWS CodeCommit is a fully managed source control service that hosts secure Git-based repositories. It eliminates the need to operate your own source control system and scales automatically.",
  },
  {
    id: "tech-30",
    domain: "Technology",
    question: "Which AWS service provides a managed build service that compiles source code, runs tests, and produces deployable artifacts?",
    options: [
      "A. AWS CodeCommit",
      "B. AWS CodeBuild",
      "C. AWS CodeDeploy",
      "D. AWS CodePipeline",
    ],
    correctIndex: 1,
    explanation: "AWS CodeBuild is a fully managed continuous integration service that compiles source code, runs tests, and produces software packages that are ready to deploy. It scales continuously and processes multiple builds concurrently.",
  },
  {
    id: "tech-31",
    domain: "Technology",
    question: "Which AWS service automates application deployments to EC2, Lambda, and on-premises servers?",
    options: [
      "A. AWS CodeBuild",
      "B. AWS CodeCommit",
      "C. AWS CodeDeploy",
      "D. AWS Elastic Beanstalk",
    ],
    correctIndex: 2,
    explanation: "AWS CodeDeploy is a fully managed deployment service that automates software deployments to EC2 instances, Lambda functions, ECS services, and on-premises servers. It supports rolling, blue/green, and canary deployment strategies.",
  },
  {
    id: "tech-32",
    domain: "Technology",
    question: "Which AWS service provides a managed API gateway for creating, publishing, and securing REST, HTTP, and WebSocket APIs?",
    options: [
      "A. AWS AppSync",
      "B. Amazon API Gateway",
      "C. AWS Direct Connect",
      "D. Amazon CloudFront",
    ],
    correctIndex: 1,
    explanation: "Amazon API Gateway is a fully managed service that makes it easy for developers to create, publish, maintain, monitor, and secure APIs at any scale. It acts as the front door for applications to access data, business logic, or functionality from backend services.",
  },
  {
    id: "tech-33",
    domain: "Technology",
    question: "Which AWS service provides a managed GraphQL API service?",
    options: [
      "A. Amazon API Gateway",
      "B. AWS AppSync",
      "C. AWS Lambda",
      "D. Amazon Cognito",
    ],
    correctIndex: 1,
    explanation: "AWS AppSync is a fully managed service that makes it easy to develop GraphQL APIs by handling the heavy lifting of securely connecting to data sources like DynamoDB, Lambda, and HTTP APIs.",
  },
  {
    id: "tech-34",
    domain: "Technology",
    question: "Which AWS service provides user authentication and authorization for web and mobile applications?",
    options: [
      "A. AWS IAM",
      "B. Amazon Cognito",
      "C. AWS Directory Service",
      "D. AWS SSO",
    ],
    correctIndex: 1,
    explanation: "Amazon Cognito provides authentication, authorization, and user management for web and mobile apps. It supports sign-up/sign-in with social identity providers (Google, Facebook) and enterprise identity providers via SAML.",
  },
  {
    id: "tech-35",
    domain: "Technology",
    question: "Which AWS service provides a managed search service based on OpenSearch (formerly Elasticsearch)?",
    options: [
      "A. Amazon Redshift",
      "B. Amazon Kendra",
      "C. Amazon OpenSearch Service",
      "D. Amazon Athena",
    ],
    correctIndex: 2,
    explanation: "Amazon OpenSearch Service (formerly Amazon Elasticsearch Service) makes it easy to deploy, secure, operate, and scale OpenSearch clusters for log analytics, full-text search, application monitoring, and more.",
  },
  {
    id: "tech-36",
    domain: "Technology",
    question: "Which AWS service provides a managed IoT platform for connecting and managing IoT devices?",
    options: [
      "A. AWS Greengrass",
      "B. AWS IoT Core",
      "C. Amazon Kinesis",
      "D. AWS Lambda",
    ],
    correctIndex: 1,
    explanation: "AWS IoT Core is a managed cloud service that lets connected devices easily and securely interact with cloud applications and other devices. It can support billions of devices and trillions of messages.",
  },
  {
    id: "tech-37",
    domain: "Technology",
    question: "Which AWS service provides machine learning-powered recommendations for cost optimization, security, and performance?",
    options: [
      "A. Amazon SageMaker",
      "B. AWS Trusted Advisor",
      "C. AWS Compute Optimizer",
      "D. AWS Cost Explorer",
    ],
    correctIndex: 2,
    explanation: "AWS Compute Optimizer uses machine learning to analyze the configuration and utilization metrics of your AWS resources and recommends optimal AWS resource configurations to reduce costs and improve performance.",
  },
  {
    id: "tech-38",
    domain: "Technology",
    question: "Which AWS service provides a fully managed machine learning platform for building, training, and deploying ML models?",
    options: [
      "A. Amazon Rekognition",
      "B. Amazon Comprehend",
      "C. Amazon SageMaker",
      "D. AWS DeepLens",
    ],
    correctIndex: 2,
    explanation: "Amazon SageMaker is a fully managed machine learning service that provides every developer and data scientist with the ability to build, train, and deploy ML models quickly. It removes the heavy lifting from each step of the ML process.",
  },

  // ── Billing & Pricing (extra) ───────────────────────────────────────────────
  {
    id: "bp-16",
    domain: "Billing & Pricing",
    question: "Which AWS support plan is the minimum level that includes access to the full set of AWS Trusted Advisor checks?",
    options: [
      "A. Basic",
      "B. Developer",
      "C. Business",
      "D. Enterprise",
    ],
    correctIndex: 2,
    explanation: "The Business support plan is the minimum level that provides access to the full set of AWS Trusted Advisor checks. Basic and Developer plans only provide access to the core six Trusted Advisor checks.",
  },
  {
    id: "bp-17",
    domain: "Billing & Pricing",
    question: "Which AWS feature allows you to receive a single bill for multiple AWS accounts while keeping the accounts separate?",
    options: [
      "A. AWS Cost Explorer",
      "B. Consolidated Billing in AWS Organizations",
      "C. AWS Budgets",
      "D. AWS Cost and Usage Report",
    ],
    correctIndex: 1,
    explanation: "Consolidated Billing in AWS Organizations lets you combine the usage from all accounts in your organization to share volume pricing discounts, Reserved Instance discounts, and Savings Plans. You receive one bill but can still see per-account costs.",
  },
  {
    id: "bp-18",
    domain: "Billing & Pricing",
    question: "A company runs a batch processing job every night for 4 hours. The job can be interrupted and restarted. Which EC2 pricing option minimizes cost?",
    options: [
      "A. On-Demand Instances",
      "B. Reserved Instances",
      "C. Spot Instances",
      "D. Dedicated Hosts",
    ],
    correctIndex: 2,
    explanation: "Spot Instances are ideal for batch jobs that can be interrupted and restarted. They offer up to 90% discount over On-Demand pricing. Since the job runs nightly and can tolerate interruptions, Spot Instances provide the lowest cost.",
  },
  {
    id: "bp-19",
    domain: "Billing & Pricing",
    question: "Which of the following is NOT a factor that determines the cost of an EC2 instance?",
    options: [
      "A. Instance type and size",
      "B. AWS Region",
      "C. The number of IAM users in the account",
      "D. Pricing model (On-Demand, Reserved, Spot)",
    ],
    correctIndex: 2,
    explanation: "EC2 costs are determined by instance type/size, Region, OS, pricing model, and data transfer. The number of IAM users in an account has no effect on EC2 pricing — IAM itself is always free.",
  },
  {
    id: "bp-20",
    domain: "Billing & Pricing",
    question: "Which AWS service provides a detailed, line-item report of all AWS charges that can be delivered to an S3 bucket?",
    options: [
      "A. AWS Cost Explorer",
      "B. AWS Budgets",
      "C. AWS Cost and Usage Report (CUR)",
      "D. AWS Pricing Calculator",
    ],
    correctIndex: 2,
    explanation: "The AWS Cost and Usage Report (CUR) is the most comprehensive source of cost and usage data. It publishes billing reports to an S3 bucket with line items for each service, resource, and tag, suitable for loading into Redshift or Athena.",
  },
  {
    id: "bp-21",
    domain: "Billing & Pricing",
    question: "What is the benefit of using AWS Reserved Instances with the 'Convertible' type compared to 'Standard'?",
    options: [
      "A. Convertible RIs provide a higher discount than Standard RIs",
      "B. Convertible RIs can be exchanged for other RIs of equal or greater value, offering more flexibility",
      "C. Convertible RIs have no upfront payment requirement",
      "D. Convertible RIs can be used across multiple AWS accounts",
    ],
    correctIndex: 1,
    explanation: "Convertible Reserved Instances allow you to exchange them for other Convertible RIs with different instance families, OS, or tenancy. They offer less discount than Standard RIs (up to 54% vs 72%) but provide more flexibility.",
  },
  {
    id: "bp-22",
    domain: "Billing & Pricing",
    question: "Which AWS pricing principle states that the more you use AWS services, the less you pay per unit?",
    options: [
      "A. Pay-as-you-go",
      "B. Save when you reserve",
      "C. Pay less by using more (volume discounts)",
      "D. Free tier pricing",
    ],
    correctIndex: 2,
    explanation: "AWS offers tiered pricing for many services — the more you use, the lower the per-unit price. For example, Amazon S3 charges less per GB as your total storage increases. This is the 'pay less by using more' pricing principle.",
  },
  {
    id: "bp-23",
    domain: "Billing & Pricing",
    question: "Which AWS support plan provides a response time of less than 15 minutes for business-critical system down cases?",
    options: [
      "A. Basic",
      "B. Developer",
      "C. Business",
      "D. Enterprise",
    ],
    correctIndex: 3,
    explanation: "The Enterprise Support plan provides a response time of less than 15 minutes for business-critical system down (Sev 1) cases. Business support provides less than 1 hour for production system down cases.",
  },
  {
    id: "bp-24",
    domain: "Billing & Pricing",
    question: "Which AWS tool can help identify underutilized EC2 instances to reduce costs?",
    options: [
      "A. AWS Pricing Calculator",
      "B. AWS Cost Explorer with rightsizing recommendations",
      "C. AWS Budgets",
      "D. AWS Cost and Usage Report",
    ],
    correctIndex: 1,
    explanation: "AWS Cost Explorer includes rightsizing recommendations that identify EC2 instances that are underutilized and suggest smaller instance types or termination, helping you reduce costs without impacting performance.",
  },
  {
    id: "bp-25",
    domain: "Billing & Pricing",
    question: "A company wants to be notified when their AWS spending is forecasted to exceed $1,000 in a month. Which service should they use?",
    options: [
      "A. AWS Cost Explorer",
      "B. AWS Budgets",
      "C. Amazon CloudWatch",
      "D. AWS Trusted Advisor",
    ],
    correctIndex: 1,
    explanation: "AWS Budgets allows you to set cost budgets and configure alerts when your actual or forecasted costs exceed a threshold. You can receive notifications via email or SNS when spending approaches or exceeds your budget.",
  },
  {
    id: "bp-26",
    domain: "Billing & Pricing",
    question: "Which of the following AWS services is included in the AWS Free Tier for 12 months after account creation?",
    options: [
      "A. 750 hours/month of Amazon EC2 t2.micro or t3.micro",
      "B. Unlimited Amazon S3 storage",
      "C. 1 TB/month of Amazon CloudFront data transfer",
      "D. 10 million Amazon DynamoDB read/write requests",
    ],
    correctIndex: 0,
    explanation: "The AWS Free Tier includes 750 hours per month of EC2 t2.micro (or t3.micro in Regions where t2.micro is not available) for 12 months. This is enough to run one instance continuously for a month.",
  },
  {
    id: "bp-27",
    domain: "Billing & Pricing",
    question: "Which AWS Organizations feature allows you to apply policies that restrict which AWS services and actions member accounts can use?",
    options: [
      "A. Consolidated Billing",
      "B. Service Control Policies (SCPs)",
      "C. AWS Config Rules",
      "D. IAM Permission Boundaries",
    ],
    correctIndex: 1,
    explanation: "Service Control Policies (SCPs) in AWS Organizations define the maximum available permissions for accounts in your organization. They act as guardrails, ensuring accounts cannot exceed the permissions defined by the SCP even if their IAM policies allow it.",
  },
];
