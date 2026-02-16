import { GoogleGenAI, Type } from "@google/genai";
import { Node, Connection, Scenario, SimulationResult } from "../types";

export const evaluateSystemDesign = async (
  scenario: Scenario,
  nodes: Node[],
  connections: Connection[]
): Promise<SimulationResult> => {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  
  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
    return {
      score: 50,
      feedback: "No Gemini API key configured. Set NEXT_PUBLIC_GEMINI_API_KEY in your .env.local file to enable AI-powered architecture reviews.",
      bottlenecks: ["API key not configured"],
      hints: ["Add NEXT_PUBLIC_GEMINI_API_KEY=your_key to .env.local"],
      trafficStats: Array.from({ length: 10 }, (_, i) => ({
        time: `${i}:00`,
        load: 50 + Math.random() * 30,
        processed: 40 + Math.random() * 20
      }))
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    As a Senior AWS Solutions Architect, evaluate this system design. 
    
    Scenario: ${scenario.title}
    Goal: ${scenario.description}
    Target Load: ${scenario.targetRPS} requests per minute
    Budget: $${scenario.budget}
    
    Architecture Data:
    Nodes: ${JSON.stringify(nodes.map(n => ({ 
      type: n.type, 
      label: n.label, 
      config: n.config,
      id: n.id 
    })))}
    Connections: ${JSON.stringify(connections)}
    
    IMPORTANT ARCHITECTURAL EVALUATION RULES:
    1. Analyze the specific 'config' toggles for each node.
    2. If a user has CloudFront but 'oac' (Origin Access Control) is false, and it connects to S3, point out the security risk.
    3. If RDS has 'multiAZ' false in a high-load scenario, flag it as a reliability bottleneck.
    4. If EC2 'autoScaling' is false for high RPS, flag it as a major scalability bottleneck.
    5. Be specific about HOW their chosen configuration settings affect the outcome.
    6. Respect 'label' as intent, but evaluate the 'config' as the actual implementation.
    
    Provide:
    - Score (0-100)
    - Detailed professional feedback
    - 2-3 specific architectural bottlenecks based on node types AND their configurations
    - 2-3 "Architect Hints" that specifically mention configuration improvements (e.g., "Enabling Multi-AZ on your database would prevent downtime during updates.")
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
            bottlenecks: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING } 
            },
            hints: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            trafficStats: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  time: { type: Type.STRING },
                  load: { type: Type.NUMBER },
                  processed: { type: Type.NUMBER }
                }
              }
            }
          },
          required: ['score', 'feedback', 'bottlenecks', 'hints', 'trafficStats']
        }
      }
    });

    return JSON.parse(response.text!.trim());
  } catch (error) {
    console.error("Evaluation error:", error);
    return {
      score: 50,
      feedback: "The AWS Architect is having trouble reading your diagram configurations. Ensure your nodes are properly set up.",
      bottlenecks: ["Communication interrupted"],
      hints: ["Try deploying again to get a fresh evaluation."],
      trafficStats: Array.from({ length: 10 }, (_, i) => ({
        time: `${i}:00`,
        load: 50,
        processed: 40
      }))
    };
  }
};
