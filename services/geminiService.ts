
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, AIAnalysis } from "../types";

const CATEGORIES = ['Alimentación', 'Transporte', 'Vivienda', 'Entretenimiento', 'Salud', 'Educación', 'Otros'];

export const getFinancialInsights = async (transactions: Transaction[]): Promise<AIAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const transactionsContext = transactions.map(t => 
    `${t.date}: ${t.description} (${t.category}) - ${t.type === 'expense' ? '-' : '+'}${t.amount}€`
  ).join('\n');

  const prompt = `Analiza los siguientes movimientos financieros del mes y proporciona consejos personalizados para ahorrar y una breve evaluación de la salud financiera del usuario. Los datos son:\n${transactionsContext}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      systemInstruction: "Eres un experto asesor financiero personal. Analizas gastos, identificas patrones innecesarios y ofreces consejos prácticos. Responde siempre en formato JSON estructurado.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: "Un resumen ejecutivo del comportamiento de gasto del usuario."
          },
          recommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Lista de al menos 3 recomendaciones específicas para ahorrar dinero basadas en los datos."
          },
          savingsPotential: {
            type: Type.STRING,
            description: "Una estimación de cuánto podría ahorrar el usuario siguiendo los consejos."
          }
        },
        required: ["summary", "recommendations", "savingsPotential"]
      }
    }
  });

  try {
    return JSON.parse(response.text || '{}') as AIAnalysis;
  } catch (error) {
    console.error("Error parsing Gemini response:", error);
    return {
      summary: "No pudimos analizar tus datos en este momento.",
      recommendations: ["Sigue registrando tus gastos para obtener mejores consejos."],
      savingsPotential: "0€"
    };
  }
};

export const extractTransactionsFromFile = async (base64Data: string, mimeType: string): Promise<Partial<Transaction>[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      },
      {
        text: `Extrae todas las transacciones financieras que encuentres en este archivo. 
        Para cada transacción, identifica:
        1. Descripción del gasto o ingreso.
        2. Importe numérico (sin símbolos de moneda).
        3. Tipo (debe ser 'expense' para gastos o 'income' para ingresos).
        4. Categoría (debe ser una de estas exactamente: ${CATEGORIES.join(', ')}).
        5. Fecha (en formato YYYY-MM-DD, si no existe usa la fecha actual).
        
        Responde exclusivamente en formato JSON como un array de objetos.`
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            category: { type: Type.STRING },
            type: { type: Type.STRING },
            date: { type: Type.STRING }
          },
          required: ["description", "amount", "category", "type", "date"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Error parsing file extraction:", error);
    return [];
  }
};
