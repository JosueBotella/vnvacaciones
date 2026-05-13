import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate unique access code
function generateAccessCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part1 = "VN";
  const part2 = new Date().getFullYear().toString();
  let part3 = "";
  for (let i = 0; i < 6; i++) {
    part3 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${part1}-${part2}-${part3}`;
}

// Calculate cognitive profile
function calculateCognitiveProfile(accuracy: number, avgTime: number, consistency: number): string {
  if (consistency < 50) return "desorganizado";
  if (accuracy >= 80 && avgTime <= 20) return "rapido_preciso";
  if (accuracy < 60 && avgTime <= 15) return "rapido_impulsivo";
  if (accuracy >= 75 && avgTime > 30) return "lento_preciso";
  return "equilibrado";
}

// Calculate recommendation
function calculateRecommendation(profile: string, accuracy: number, consistency: number): string {
  if (profile === "desorganizado" || accuracy < 40 || consistency < 40) {
    return "no_recomendable";
  }
  if (profile === "rapido_preciso" && accuracy >= 75 && consistency >= 70) {
    return "muy_recomendable";
  }
  if (accuracy >= 60 && consistency >= 60) {
    return "recomendable_reservas";
  }
  return "no_recomendable";
}

// Professional question bank (30 questions)
const PROFESSIONAL_QUESTIONS = [
  // SECTION 1: NUMERICAL LOGIC (6 questions)
  {
    category: "logica_numerica",
    question_type: "number_series",
    question_text: "¿Qué número continúa la serie?",
    question_data: {
      series: [3, 6, 12, 24, "?"],
      options: [
        { id: "A", value: 36 },
        { id: "B", value: 40 },
        { id: "C", value: 48 },
        { id: "D", value: 60 }
      ]
    },
    correct_answer: "C",
    time_limit_seconds: 35,
    points: 1
  },
  {
    category: "logica_numerica",
    question_type: "number_series",
    question_text: "¿Qué número continúa la serie alterna?",
    question_data: {
      series: [2, 5, 4, 7, 6, "?"],
      options: [
        { id: "A", value: 7 },
        { id: "B", value: 8 },
        { id: "C", value: 9 },
        { id: "D", value: 5 }
      ]
    },
    correct_answer: "C",
    time_limit_seconds: 40,
    points: 1
  },
  {
    category: "logica_numerica",
    question_type: "fraction_comparison",
    question_text: "¿Cuál de estos valores es el mayor?",
    question_data: {
      options: [
        { id: "A", display: "2/3", type: "fraction" },
        { id: "B", display: "3/5", type: "fraction" },
        { id: "C", display: "5/8", type: "fraction" },
        { id: "D", display: "4/7", type: "fraction" }
      ]
    },
    correct_answer: "A",
    time_limit_seconds: 30,
    points: 1
  },
  {
    category: "logica_numerica",
    question_type: "multiple_choice",
    question_text: "Un reloj avanza 5 minutos cada 10 minutos reales. Si empieza a las 12:00, ¿qué hora marcará después de 1 hora real?",
    question_data: {
      options: [
        { id: "A", text: "12:30" },
        { id: "B", text: "12:40" },
        { id: "C", text: "1:30" },
        { id: "D", text: "1:00" }
      ]
    },
    correct_answer: "C",
    time_limit_seconds: 50,
    points: 1
  },
  {
    category: "logica_numerica",
    question_type: "number_series",
    question_text: "¿Qué número completa la serie?",
    question_data: {
      series: [1, 1, 2, 3, 5, 8, "?"],
      options: [
        { id: "A", value: 11 },
        { id: "B", value: 12 },
        { id: "C", value: 13 },
        { id: "D", value: 14 }
      ]
    },
    correct_answer: "C",
    time_limit_seconds: 35,
    points: 1
  },
  {
    category: "logica_numerica",
    question_type: "multiple_choice",
    question_text: "Si el doble de un número más 6 es igual a 20, ¿cuál es el número?",
    question_data: {
      options: [
        { id: "A", text: "5" },
        { id: "B", text: "7" },
        { id: "C", text: "8" },
        { id: "D", text: "14" }
      ]
    },
    correct_answer: "B",
    time_limit_seconds: 35,
    points: 1
  },

  // SECTION 2: VISUAL ABSTRACT REASONING (8 questions)
  {
    category: "razonamiento_visual",
    question_type: "matrix",
    question_text: "¿Qué figura completa la matriz?",
    question_data: {
      grid: [
        ["circle", "square", "triangle"],
        ["square", "triangle", "circle"],
        ["triangle", "circle", "?"]
      ],
      options: [
        { id: "A", symbol: "circle" },
        { id: "B", symbol: "square" },
        { id: "C", symbol: "triangle" },
        { id: "D", symbol: "diamond" }
      ]
    },
    correct_answer: "B",
    time_limit_seconds: 45,
    points: 1
  },
  {
    category: "razonamiento_visual",
    question_type: "sequence",
    question_text: "¿Qué flecha continúa el patrón?",
    question_data: {
      sequence: ["up", "right", "down", "left", "up", "right", "down", "?"],
      options: [
        { id: "A", value: "up" },
        { id: "B", value: "down" },
        { id: "C", value: "left" },
        { id: "D", value: "right" }
      ]
    },
    correct_answer: "C",
    time_limit_seconds: 30,
    points: 1
  },
  {
    category: "razonamiento_visual",
    question_type: "visual_comparison",
    question_text: "¿Cuál de estas figuras es diferente al resto?",
    question_data: {
      type: "find_different",
      figures: [
        { id: "A", content: "lines_3" },
        { id: "B", content: "lines_3" },
        { id: "C", content: "lines_2" },
        { id: "D", content: "lines_3" }
      ]
    },
    correct_answer: "C",
    time_limit_seconds: 25,
    points: 1
  },
  {
    category: "razonamiento_visual",
    question_type: "domino_series",
    question_text: "¿Qué dominó completa la serie?",
    question_data: {
      series: [[0, 1], [1, 2], [2, 3]],
      options: [
        { id: "A", text: "3|4" },
        { id: "B", text: "4|3" },
        { id: "C", text: "2|4" },
        { id: "D", text: "3|3" }
      ]
    },
    correct_answer: "A",
    time_limit_seconds: 40,
    points: 1
  },
  {
    category: "razonamiento_visual",
    question_type: "domino_series",
    question_text: "¿Qué dominó sigue en la secuencia?",
    question_data: {
      series: [[2, 4], [3, 5], [4, 6]],
      options: [
        { id: "A", text: "5|0" },
        { id: "B", text: "5|1" },
        { id: "C", text: "6|1" },
        { id: "D", text: "0|1" }
      ]
    },
    correct_answer: "A",
    time_limit_seconds: 45,
    points: 1
  },
  {
    category: "razonamiento_visual",
    question_type: "domino_series",
    question_text: "Encuentra el dominó que continúa el patrón.",
    question_data: {
      series: [[1, 1], [2, 2], [3, 3]],
      options: [
        { id: "A", text: "4|4" },
        { id: "B", text: "3|4" },
        { id: "C", text: "4|3" },
        { id: "D", text: "5|5" }
      ]
    },
    correct_answer: "A",
    time_limit_seconds: 35,
    points: 1
  },
  {
    category: "razonamiento_visual",
    question_type: "matrix",
    question_text: "¿Qué símbolo falta en la matriz?",
    question_data: {
      grid: [
        ["star", "star", "circle"],
        ["star", "circle", "circle"],
        ["circle", "circle", "?"]
      ],
      options: [
        { id: "A", symbol: "star" },
        { id: "B", symbol: "circle" },
        { id: "C", symbol: "square" },
        { id: "D", symbol: "triangle" }
      ]
    },
    correct_answer: "B",
    time_limit_seconds: 40,
    points: 1
  },
  {
    category: "razonamiento_visual",
    question_type: "sequence",
    question_text: "¿Qué elemento sigue en la secuencia?",
    question_data: {
      sequence: ["○", "●", "○", "●", "○", "?"],
      options: [
        { id: "A", value: "○" },
        { id: "B", value: "●" },
        { id: "C", value: "◐" },
        { id: "D", value: "◑" }
      ]
    },
    correct_answer: "B",
    time_limit_seconds: 25,
    points: 1
  },

  // SECTION 3: ATTENTION AND PERCEPTION (5 questions)
  {
    category: "atencion_percepcion",
    question_type: "visual_comparison",
    question_text: "¿Cuál de estas figuras tiene un número diferente de elementos?",
    question_data: {
      type: "find_different",
      figures: [
        { id: "A", content: "lines_4" },
        { id: "B", content: "lines_4" },
        { id: "C", content: "lines_4" },
        { id: "D", content: "lines_3" }
      ]
    },
    correct_answer: "D",
    time_limit_seconds: 20,
    points: 1
  },
  {
    category: "atencion_percepcion",
    question_type: "multiple_choice",
    question_text: "En la secuencia 3-7-2-9-7-4-7-1, ¿cuántas veces aparece el número 7?",
    question_data: {
      options: [
        { id: "A", text: "2 veces" },
        { id: "B", text: "3 veces" },
        { id: "C", text: "4 veces" },
        { id: "D", text: "5 veces" }
      ]
    },
    correct_answer: "B",
    time_limit_seconds: 25,
    points: 1
  },
  {
    category: "atencion_percepcion",
    question_type: "multiple_choice",
    question_text: "¿Cuántos triángulos hay si una figura tiene 4 triángulos grandes, cada uno dividido en 3 triángulos pequeños?",
    question_data: {
      options: [
        { id: "A", text: "12" },
        { id: "B", text: "16" },
        { id: "C", text: "15" },
        { id: "D", text: "17" }
      ]
    },
    correct_answer: "B",
    time_limit_seconds: 35,
    points: 1
  },
  {
    category: "atencion_percepcion",
    question_type: "sequence",
    question_text: "¿Qué símbolo rompe el patrón?",
    question_data: {
      sequence: ["□", "○", "□", "○", "△", "○", "?"],
      options: [
        { id: "A", value: "□" },
        { id: "B", value: "○" },
        { id: "C", value: "△" },
        { id: "D", value: "◇" }
      ]
    },
    correct_answer: "A",
    time_limit_seconds: 30,
    points: 1
  },
  {
    category: "atencion_percepcion",
    question_type: "multiple_choice",
    question_text: "En el texto 'ABCDAEFGAHIJ', ¿cuántas veces aparece la letra A?",
    question_data: {
      options: [
        { id: "A", text: "2 veces" },
        { id: "B", text: "3 veces" },
        { id: "C", text: "4 veces" },
        { id: "D", text: "5 veces" }
      ]
    },
    correct_answer: "B",
    time_limit_seconds: 20,
    points: 1
  },

  // SECTION 4: VERBAL LOGIC (6 questions)
  {
    category: "logica_verbal",
    question_type: "multiple_choice",
    question_text: "Todos los ingenieros son técnicos. Algunos técnicos son jefes. ¿Es seguro que algunos ingenieros son jefes?",
    question_data: {
      options: [
        { id: "A", text: "Sí, siempre" },
        { id: "B", text: "No necesariamente" },
        { id: "C", text: "Nunca" },
        { id: "D", text: "Solo si son técnicos" }
      ]
    },
    correct_answer: "B",
    time_limit_seconds: 45,
    points: 1
  },
  {
    category: "logica_verbal",
    question_type: "multiple_choice",
    question_text: "Luisa es mayor que Ana. Irene es mayor que Luisa. ¿Quién es la mayor?",
    question_data: {
      options: [
        { id: "A", text: "Luisa" },
        { id: "B", text: "Ana" },
        { id: "C", text: "Irene" },
        { id: "D", text: "No se puede saber" }
      ]
    },
    correct_answer: "C",
    time_limit_seconds: 30,
    points: 1
  },
  {
    category: "logica_verbal",
    question_type: "multiple_choice",
    question_text: "Tras comer 5 peras de la cesta, quedan 3. ¿Cuántas peras había inicialmente?",
    question_data: {
      options: [
        { id: "A", text: "5" },
        { id: "B", text: "3" },
        { id: "C", text: "8" },
        { id: "D", text: "2" }
      ]
    },
    correct_answer: "C",
    time_limit_seconds: 25,
    points: 1
  },
  {
    category: "logica_verbal",
    question_type: "multiple_choice",
    question_text: "¿Cuál es el sinónimo de ANÁLOGO?",
    question_data: {
      options: [
        { id: "A", text: "Diferente" },
        { id: "B", text: "Semejante" },
        { id: "C", text: "Digital" },
        { id: "D", text: "Opuesto" }
      ]
    },
    correct_answer: "B",
    time_limit_seconds: 25,
    points: 1
  },
  {
    category: "logica_verbal",
    question_type: "multiple_choice",
    question_text: "Libro es a Leer como Canción es a...",
    question_data: {
      options: [
        { id: "A", text: "Bailar" },
        { id: "B", text: "Escribir" },
        { id: "C", text: "Escuchar" },
        { id: "D", text: "Cantar" }
      ]
    },
    correct_answer: "C",
    time_limit_seconds: 30,
    points: 1
  },
  {
    category: "logica_verbal",
    question_type: "multiple_choice",
    question_text: "Si A viene antes que B, y C viene después de B, ¿cuál es el orden correcto?",
    question_data: {
      options: [
        { id: "A", text: "B, A, C" },
        { id: "B", text: "A, B, C" },
        { id: "C", text: "C, B, A" },
        { id: "D", text: "A, C, B" }
      ]
    },
    correct_answer: "B",
    time_limit_seconds: 30,
    points: 1
  },

  // SECTION 5: MEMORY (3 questions)
  {
    category: "memoria_visual",
    question_type: "memory",
    question_text: "¿Cuál era la secuencia mostrada?",
    question_data: {
      memoryPattern: ["△", "○", "□", "△"],
      memoryShowTime: 4000,
      options: [
        { id: "A", text: "△ ○ □ △" },
        { id: "B", text: "○ △ □ △" },
        { id: "C", text: "△ □ ○ △" },
        { id: "D", text: "□ ○ △ △" }
      ]
    },
    correct_answer: "A",
    time_limit_seconds: 20,
    points: 1
  },
  {
    category: "memoria_visual",
    question_type: "memory",
    question_text: "¿Qué números aparecieron?",
    question_data: {
      memoryPattern: ["7", "2", "9", "4"],
      memoryShowTime: 4000,
      options: [
        { id: "A", text: "7, 2, 9, 4" },
        { id: "B", text: "7, 4, 9, 2" },
        { id: "C", text: "2, 7, 4, 9" },
        { id: "D", text: "9, 2, 7, 4" }
      ]
    },
    correct_answer: "A",
    time_limit_seconds: 20,
    points: 1
  },
  {
    category: "memoria_visual",
    question_type: "memory",
    question_text: "¿Cuál era el orden de los colores?",
    question_data: {
      memoryPattern: ["🔵", "🔴", "🟢", "🔵"],
      memoryShowTime: 4000,
      options: [
        { id: "A", text: "Azul, Rojo, Verde, Azul" },
        { id: "B", text: "Rojo, Azul, Verde, Azul" },
        { id: "C", text: "Azul, Verde, Rojo, Azul" },
        { id: "D", text: "Verde, Rojo, Azul, Azul" }
      ]
    },
    correct_answer: "A",
    time_limit_seconds: 20,
    points: 1
  },

  // SECTION 6: CONSISTENCY / TRAP QUESTIONS (2 questions)
  {
    category: "consistencia",
    question_type: "number_series",
    question_text: "¿Qué número sigue? (Patrón: +3, -1 alternando)",
    question_data: {
      series: [5, 8, 7, 10, 9, "?"],
      options: [
        { id: "A", value: 10 },
        { id: "B", value: 11 },
        { id: "C", value: 12 },
        { id: "D", value: 8 }
      ]
    },
    correct_answer: "C",
    time_limit_seconds: 40,
    points: 1
  },
  {
    category: "consistencia",
    question_type: "multiple_choice",
    question_text: "Si hoy es martes, ¿qué día será dentro de 3 días?",
    question_data: {
      options: [
        { id: "A", text: "Jueves" },
        { id: "B", text: "Viernes" },
        { id: "C", text: "Sábado" },
        { id: "D", text: "Domingo" }
      ]
    },
    correct_answer: "B",
    time_limit_seconds: 20,
    points: 1
  }
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action } = body;

    console.log("psico-test-operations action:", action);

    // ==================== GET AREAS ====================
    if (action === "getAreas") {
      const { data: areas, error } = await supabase
        .from("psico_test_areas")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) {
        console.error("Error fetching areas:", error);
        return new Response(
          JSON.stringify({ success: false, error: "Error al cargar las áreas" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, areas: areas || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== GET ALL AREAS (Admin) ====================
    if (action === "getAllAreas") {
      const { data: areas, error } = await supabase
        .from("psico_test_areas")
        .select("*")
        .order("display_order");

      if (error) {
        console.error("Error fetching all areas:", error);
        return new Response(
          JSON.stringify({ success: false, error: "Error al cargar las áreas" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, areas: areas || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== UPDATE AREA ====================
    if (action === "updateArea") {
      const { areaId, is_active, name, description, icon } = body;

      const updates: Record<string, any> = {};
      if (typeof is_active === "boolean") updates.is_active = is_active;
      if (name) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (icon) updates.icon = icon;

      const { error } = await supabase
        .from("psico_test_areas")
        .update(updates)
        .eq("id", areaId);

      if (error) {
        console.error("Error updating area:", error);
        return new Response(
          JSON.stringify({ success: false, error: "Error al actualizar el área" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== SEED PROFESSIONAL QUESTIONS ====================
    if (action === "seedProfessionalQuestions") {
      // Get or create active test
      let { data: test } = await supabase
        .from("psico_tests")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!test) {
        const { data: newTest, error: createError } = await supabase
          .from("psico_tests")
          .insert({
            name: "Test Psicotécnico VN",
            description: "Test de selección profesional",
            time_limit_minutes: 20,
            questions_count: 30,
            is_active: true
          })
          .select()
          .single();

        if (createError) {
          console.error("Error creating test:", createError);
          return new Response(
            JSON.stringify({ success: false, error: "Error al crear el test" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        test = newTest;
      }

      // Delete old questions
      await supabase
        .from("psico_questions")
        .delete()
        .eq("test_id", test.id);

      // Insert professional questions
      const questionsToInsert = PROFESSIONAL_QUESTIONS.map((q, idx) => ({
        test_id: test.id,
        order_index: idx + 1,
        ...q
      }));

      const { error: insertError } = await supabase
        .from("psico_questions")
        .insert(questionsToInsert);

      if (insertError) {
        console.error("Error inserting questions:", insertError);
        return new Response(
          JSON.stringify({ success: false, error: "Error al insertar preguntas" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update test questions count
      await supabase
        .from("psico_tests")
        .update({ questions_count: PROFESSIONAL_QUESTIONS.length })
        .eq("id", test.id);

      console.log(`Seeded ${PROFESSIONAL_QUESTIONS.length} professional questions`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `${PROFESSIONAL_QUESTIONS.length} preguntas profesionales insertadas`,
          testId: test.id 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== REGISTER AND START TEST (Direct entry) ====================
    if (action === "registerAndStartTest") {
      const { firstName, lastName, phone, areaId } = body;

      const candidateName = `${firstName} ${lastName}`.trim();

      // Get test - either by area or default
      let test;
      let areaName = null;

      if (areaId) {
        // Get area info
        const { data: area } = await supabase
          .from("psico_test_areas")
          .select("*")
          .eq("id", areaId)
          .single();

        if (area) {
          areaName = area.name;
        }

        // Try to get test associated with this area
        const { data: areaTest } = await supabase
          .from("psico_tests")
          .select("*")
          .eq("area_id", areaId)
          .eq("is_active", true)
          .limit(1)
          .single();

        if (areaTest) {
          test = areaTest;
        }
      }

      // Fallback to default test if no area-specific test found
      if (!test) {
        const { data: defaultTest } = await supabase
          .from("psico_tests")
          .select("*")
          .eq("is_active", true)
          .limit(1)
          .single();

        test = defaultTest;
      }

      if (!test) {
        return new Response(
          JSON.stringify({ success: false, error: "No hay un test activo configurado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const accessCode = generateAccessCode();

      // Create session and mark as in_progress immediately
      const { data: session, error: insertError } = await supabase
        .from("psico_sessions")
        .insert({
          test_id: test.id,
          candidate_name: candidateName,
          candidate_phone: phone,
          position_applied: areaName || "Candidato",
          access_code: accessCode,
          status: "in_progress",
          started_at: new Date().toISOString(),
          area_id: areaId || null,
        })
        .select()
        .single();

      if (insertError || !session) {
        console.error("Error creating session:", insertError);
        return new Response(
          JSON.stringify({ success: false, error: "Error al crear la sesión" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          sessionId: session.id,
          candidateName: candidateName,
          testName: test.name || "Test Psicotécnico",
          timeLimit: test.time_limit_minutes || 20,
          questionsCount: test.questions_count || 30,
          areaName: areaName,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== VALIDATE CANDIDATE BY NAME (Legacy) ====================
    if (action === "validateCandidate") {
      const { candidateName } = body;

      const { data: sessions, error } = await supabase
        .from("psico_sessions")
        .select("*, psico_tests(*)")
        .ilike("candidate_name", candidateName.trim())
        .in("status", ["pending", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (error || !sessions || sessions.length === 0) {
        return new Response(
          JSON.stringify({ valid: false, error: "No se encontró una sesión activa para este nombre" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const session = sessions[0];

      if (session.status === "expired" || (session.expires_at && new Date(session.expires_at) < new Date())) {
        return new Response(
          JSON.stringify({ valid: false, error: "Tu sesión ha expirado. Contacta con RRHH." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          valid: true,
          sessionId: session.id,
          candidateName: session.candidate_name,
          position: session.position_applied,
          testName: session.psico_tests?.name || "Test Psicotécnico",
          timeLimit: session.psico_tests?.time_limit_minutes || 20,
          questionsCount: session.psico_tests?.questions_count || 30,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== START TEST ====================
    if (action === "startTest") {
      const { sessionId } = body;

      const { data: session, error: sessionError } = await supabase
        .from("psico_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (sessionError || !session) {
        return new Response(
          JSON.stringify({ success: false, error: "Sesión no encontrada" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Only update if pending (not if already in_progress for resume)
      if (session.status === "pending") {
        const { error: updateError } = await supabase
          .from("psico_sessions")
          .update({
            status: "in_progress",
            started_at: new Date().toISOString(),
          })
          .eq("id", session.id);

        if (updateError) {
          console.error("Error starting test:", updateError);
          return new Response(
            JSON.stringify({ success: false, error: "Error al iniciar el test" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== GET TEST DATA ====================
    if (action === "getTestData") {
      const { sessionId } = body;

      const { data: session, error: sessionError } = await supabase
        .from("psico_sessions")
        .select("*, psico_tests(*)")
        .eq("id", sessionId)
        .single();

      if (sessionError || !session) {
        return new Response(
          JSON.stringify({ success: false, error: "Sesión no encontrada" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (session.status !== "in_progress") {
        return new Response(
          JSON.stringify({ success: false, error: "El test no está activo" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get questions
      const { data: questions, error: questionsError } = await supabase
        .from("psico_questions")
        .select("id, category, question_type, question_text, question_data, correct_answer, time_limit_seconds, points, order_index")
        .eq("test_id", session.test_id)
        .eq("is_active", true)
        .order("order_index");

      if (questionsError) {
        console.error("Error fetching questions:", questionsError);
        return new Response(
          JSON.stringify({ success: false, error: "Error al cargar las preguntas" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Calculate remaining time
      const startTime = new Date(session.started_at).getTime();
      const elapsed = (Date.now() - startTime) / 1000;
      const totalTime = (session.psico_tests?.time_limit_minutes || 20) * 60;
      const remainingTime = Math.max(0, totalTime - elapsed);

      // Remove correct_answer from response (security)
      const safeQuestions = questions?.map((q: any) => ({
        ...q,
        correct_answer: undefined,
      })) || [];

      return new Response(
        JSON.stringify({
          success: true,
          session: {
            id: session.id,
            candidate_name: session.candidate_name,
            position_applied: session.position_applied,
            test_id: session.test_id,
            status: session.status,
            current_question_index: session.current_question_index || 0,
          },
          questions: safeQuestions,
          remainingTime: Math.floor(remainingTime),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== SUBMIT ANSWER ====================
    if (action === "submitAnswer") {
      const { sessionId, questionId, answer, timeTaken, timeout } = body;

      // Get the correct answer
      const { data: question } = await supabase
        .from("psico_questions")
        .select("correct_answer")
        .eq("id", questionId)
        .single();

      const isCorrect = answer === question?.correct_answer;

      // Insert or update answer
      const { error } = await supabase
        .from("psico_answers")
        .upsert({
          session_id: sessionId,
          question_id: questionId,
          answer_given: answer,
          is_correct: isCorrect,
          time_taken_seconds: timeTaken,
          answered_at: new Date().toISOString(),
        }, { onConflict: "session_id,question_id" });

      if (error) {
        console.error("Error submitting answer:", error);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== UPDATE PROGRESS ====================
    if (action === "updateProgress") {
      const { sessionId, currentIndex } = body;

      await supabase
        .from("psico_sessions")
        .update({ current_question_index: currentIndex })
        .eq("id", sessionId);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== COMPLETE TEST ====================
    if (action === "completeTest") {
      const { sessionId } = body;

      // Get session and answers
      const { data: session } = await supabase
        .from("psico_sessions")
        .select("*, psico_tests(*)")
        .eq("id", sessionId)
        .single();

      const { data: answers } = await supabase
        .from("psico_answers")
        .select("*, psico_questions(category, points)")
        .eq("session_id", sessionId);

      const { data: allQuestions } = await supabase
        .from("psico_questions")
        .select("id, category")
        .eq("test_id", session?.test_id)
        .eq("is_active", true);

      // Calculate results
      const totalQuestions = allQuestions?.length || 30;
      const answeredQuestions = answers?.length || 0;
      const correctAnswers = answers?.filter((a: any) => a.is_correct).length || 0;
      const incorrectAnswers = answeredQuestions - correctAnswers;
      const unanswered = totalQuestions - answeredQuestions;
      const accuracy = (correctAnswers / totalQuestions) * 100;

      // Calculate time
      const startTime = new Date(session?.started_at).getTime();
      const endTime = Date.now();
      const totalTime = Math.round((endTime - startTime) / 1000);
      const avgTime = answeredQuestions > 0 ? totalTime / answeredQuestions : 0;

      // Speed index (0-100, higher is faster)
      const maxTimePerQuestion = 45;
      const speedIndex = Math.max(0, Math.min(100, 100 - (avgTime / maxTimePerQuestion) * 100));

      // Consistency index (check for random patterns)
      let consistencyIndex = 100;
      if (avgTime < 5 && accuracy < 50) {
        consistencyIndex = 30;
      } else if (avgTime < 10 && accuracy < 40) {
        consistencyIndex = 50;
      } else if (accuracy < 30) {
        consistencyIndex = 40;
      }

      // Calculate category scores
      const categoryScores: Record<string, number> = {};
      const categoryTotals: Record<string, number> = {};
      const categoryCorrect: Record<string, number> = {};

      allQuestions?.forEach((q: any) => {
        categoryTotals[q.category] = (categoryTotals[q.category] || 0) + 1;
      });

      answers?.forEach((a: any) => {
        const cat = a.psico_questions?.category;
        if (cat && a.is_correct) {
          categoryCorrect[cat] = (categoryCorrect[cat] || 0) + 1;
        }
      });

      Object.keys(categoryTotals).forEach((cat) => {
        categoryScores[cat] = ((categoryCorrect[cat] || 0) / categoryTotals[cat]) * 100;
      });

      // Calculate profile and recommendation
      const cognitiveProfile = calculateCognitiveProfile(accuracy, avgTime, consistencyIndex);
      const recommendation = calculateRecommendation(cognitiveProfile, accuracy, consistencyIndex);

      // Update session
      await supabase
        .from("psico_sessions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          total_time_seconds: totalTime,
        })
        .eq("id", sessionId);

      // Create or update results
      await supabase
        .from("psico_results")
        .upsert({
          session_id: sessionId,
          total_questions: totalQuestions,
          correct_answers: correctAnswers,
          incorrect_answers: incorrectAnswers,
          unanswered,
          accuracy_percentage: accuracy,
          average_time_per_question: avgTime,
          speed_index: speedIndex,
          consistency_index: consistencyIndex,
          cognitive_profile: cognitiveProfile,
          recommendation,
          category_scores: categoryScores,
        }, { onConflict: "session_id" });

      // Calculate category summary for candidate (without revealing exact scores)
      const categoryLabels: Record<string, string> = {
        logica_numerica: "Lógica Numérica",
        razonamiento_visual: "Razonamiento Visual",
        atencion_percepcion: "Atención y Percepción",
        logica_verbal: "Lógica Verbal",
        velocidad: "Velocidad de Procesamiento",
        memoria_visual: "Memoria Visual",
        consistencia: "Consistencia"
      };

      const categorySummary = Object.keys(categoryTotals).map((cat) => {
        const total = categoryTotals[cat] || 0;
        const correct = categoryCorrect[cat] || 0;
        const percentage = total > 0 ? (correct / total) * 100 : 0;
        
        let level: "excelente" | "bueno" | "regular" | "mejorable";
        if (percentage >= 80) level = "excelente";
        else if (percentage >= 60) level = "bueno";
        else if (percentage >= 40) level = "regular";
        else level = "mejorable";

        return {
          category: cat,
          label: categoryLabels[cat] || cat,
          total,
          correct,
          level
        };
      });

      return new Response(
        JSON.stringify({ 
          success: true,
          summary: {
            candidateName: session?.candidate_name,
            position: session?.position_applied,
            totalQuestions,
            answeredQuestions,
            categorySummary,
            completedAt: new Date().toISOString()
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== CREATE SESSION (Admin) ====================
    if (action === "createSession") {
      const { candidateName, candidateEmail, candidatePhone, position } = body;

      // Get default test
      const { data: test } = await supabase
        .from("psico_tests")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!test) {
        return new Response(
          JSON.stringify({ success: false, error: "No hay un test activo configurado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const accessCode = generateAccessCode();

      const { error } = await supabase
        .from("psico_sessions")
        .insert({
          test_id: test.id,
          candidate_name: candidateName,
          candidate_email: candidateEmail,
          candidate_phone: candidatePhone,
          position_applied: position,
          access_code: accessCode,
          status: "pending",
        });

      if (error) {
        console.error("Error creating session:", error);
        return new Response(
          JSON.stringify({ success: false, error: "Error al crear la sesión" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, accessCode }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== DELETE SESSION (Admin) ====================
    if (action === "deleteSession") {
      const { sessionId } = body;

      await supabase
        .from("psico_sessions")
        .delete()
        .eq("id", sessionId);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== GET ADMIN DATA ====================
    if (action === "getAdminData") {
      // Get all sessions with results AND area info
      const { data: sessions, error } = await supabase
        .from("psico_sessions")
        .select("*, psico_results(*), psico_test_areas(id, name)")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching sessions:", error);
        return new Response(
          JSON.stringify({ error: "Error al cargar los datos" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      // Get all areas for stats
      const { data: allAreas } = await supabase
        .from("psico_test_areas")
        .select("id, name, is_active")
        .order("display_order");

      // Get all questions for difficulty analysis
      const { data: allQuestions } = await supabase
        .from("psico_questions")
        .select("id, question_text, category")
        .eq("is_active", true);

      // Get all answers for question analytics
      const { data: allAnswers } = await supabase
        .from("psico_answers")
        .select("question_id, is_correct");

      // Calculate question difficulty (success rate per question)
      const questionStats: Record<string, { attempts: number; correct: number; text: string }> = {};
      allQuestions?.forEach((q: any) => {
        questionStats[q.id] = { attempts: 0, correct: 0, text: q.question_text };
      });
      allAnswers?.forEach((a: any) => {
        if (questionStats[a.question_id]) {
          questionStats[a.question_id].attempts++;
          if (a.is_correct) questionStats[a.question_id].correct++;
        }
      });

      // Find hardest questions (lowest success rate with at least 3 attempts)
      const hardestQuestions = Object.entries(questionStats)
        .filter(([_, stats]) => stats.attempts >= 3)
        .map(([id, stats]) => ({
          text: stats.text,
          successRate: stats.attempts > 0 ? (stats.correct / stats.attempts) * 100 : 0,
        }))
        .sort((a, b) => a.successRate - b.successRate)
        .slice(0, 5);

      // Transform session data with area info
      const candidates = sessions?.map((s: any) => ({
        id: s.id,
        candidate_name: s.candidate_name,
        candidate_email: s.candidate_email,
        candidate_phone: s.candidate_phone,
        position_applied: s.position_applied,
        access_code: s.access_code,
        status: s.status,
        started_at: s.started_at,
        completed_at: s.completed_at,
        total_time_seconds: s.total_time_seconds,
        created_at: s.created_at,
        area_id: s.area_id || null,
        area_name: s.psico_test_areas?.name || null,
        result: s.psico_results?.[0] ? {
          accuracy_percentage: s.psico_results[0].accuracy_percentage,
          cognitive_profile: s.psico_results[0].cognitive_profile,
          recommendation: s.psico_results[0].recommendation,
          speed_index: s.psico_results[0].speed_index,
          consistency_index: s.psico_results[0].consistency_index,
          category_scores: s.psico_results[0].category_scores,
        } : null,
      })) || [];

      // Calculate stats
      const completedCandidates = candidates.filter((c: any) => c.status === "completed" && c.result);
      const inProgressCandidates = candidates.filter((c: any) => c.status === "in_progress");
      const profileCounts: Record<string, number> = {};
      const recommendationCounts: Record<string, number> = {};
      const categoryScoresSum: Record<string, { total: number; count: number }> = {};
      let totalScore = 0;
      let totalTime = 0;
      let totalTimePerQuestion = 0;
      let timePerQuestionCount = 0;

      completedCandidates.forEach((c: any) => {
        if (c.result) {
          totalScore += c.result.accuracy_percentage;
          totalTime += c.total_time_seconds || 0;
          
          // Calculate time per question (assuming ~30 questions)
          if (c.total_time_seconds) {
            totalTimePerQuestion += c.total_time_seconds / 30;
            timePerQuestionCount++;
          }
          
          const profile = c.result.cognitive_profile;
          profileCounts[profile] = (profileCounts[profile] || 0) + 1;
          
          const rec = c.result.recommendation;
          recommendationCounts[rec] = (recommendationCounts[rec] || 0) + 1;

          // Accumulate category scores
          if (c.result.category_scores) {
            Object.entries(c.result.category_scores).forEach(([cat, score]) => {
              if (!categoryScoresSum[cat]) {
                categoryScoresSum[cat] = { total: 0, count: 0 };
              }
              categoryScoresSum[cat].total += score as number;
              categoryScoresSum[cat].count++;
            });
          }
        }
      });

      // Calculate completion rate
      const startedTests = completedCandidates.length + inProgressCandidates.length;
      const completionRate = startedTests > 0 ? (completedCandidates.length / startedTests) * 100 : 0;

      // Average time per question
      const avgTimePerQuestion = timePerQuestionCount > 0 ? totalTimePerQuestion / timePerQuestionCount : 0;

      const profileColors: Record<string, string> = {
        rapido_preciso: "#22c55e",
        rapido_impulsivo: "#f59e0b",
        lento_preciso: "#3b82f6",
        desorganizado: "#ef4444",
        equilibrado: "#8b5cf6",
      };

      const profileLabels: Record<string, string> = {
        rapido_preciso: "Rápido y Preciso",
        rapido_impulsivo: "Rápido e Impulsivo",
        lento_preciso: "Lento pero Preciso",
        desorganizado: "Desorganizado",
        equilibrado: "Equilibrado",
      };

      const recommendationColors: Record<string, string> = {
        muy_recomendable: "#22c55e",
        recomendable_reservas: "#f59e0b",
        no_recomendable: "#ef4444",
      };

      const recommendationLabels: Record<string, string> = {
        muy_recomendable: "Muy Recomendable",
        recomendable_reservas: "Con Reservas",
        no_recomendable: "No Recomendable",
      };

      const categoryLabels: Record<string, string> = {
        logica_numerica: "Lógica Numérica",
        razonamiento_visual: "Razonamiento Visual",
        atencion_percepcion: "Atención",
        logica_verbal: "Lógica Verbal",
        velocidad: "Velocidad",
        memoria_visual: "Memoria",
        consistencia: "Consistencia",
      };

      const categoryColors: Record<string, string> = {
        logica_numerica: "#3b82f6",
        razonamiento_visual: "#8b5cf6",
        atencion_percepcion: "#ec4899",
        logica_verbal: "#06b6d4",
        velocidad: "#f59e0b",
        memoria_visual: "#22c55e",
        consistencia: "#6366f1",
      };

      // Calculate category performance
      const categoryPerformance = Object.entries(categoryScoresSum).map(([cat, data]) => ({
        category: categoryLabels[cat] || cat,
        avgScore: data.count > 0 ? data.total / data.count : 0,
        color: categoryColors[cat] || "#888",
      })).sort((a, b) => b.avgScore - a.avgScore);

      // Calculate temporal data (last 14 days)
      const temporalData: { date: string; tests: number; avgScore: number }[] = [];
      const last30Days: Record<string, { count: number; totalScore: number }> = {};
      
      completedCandidates.forEach((c: any) => {
        if (c.completed_at && c.result) {
          const date = new Date(c.completed_at).toISOString().split('T')[0];
          if (!last30Days[date]) {
            last30Days[date] = { count: 0, totalScore: 0 };
          }
          last30Days[date].count++;
          last30Days[date].totalScore += c.result.accuracy_percentage;
        }
      });

      // Generate last 14 days
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayData = last30Days[dateStr];
        temporalData.push({
          date: dateStr.slice(5),
          tests: dayData?.count || 0,
          avgScore: dayData ? Math.round(dayData.totalScore / dayData.count) : 0,
        });
      }

      // Calculate area stats
      const areaStats = (allAreas || []).map((area: any) => {
        const areaCandidates = candidates.filter((c: any) => c.area_id === area.id);
        const areaCompleted = areaCandidates.filter((c: any) => c.status === "completed" && c.result);
        const areaInProgress = areaCandidates.filter((c: any) => c.status === "in_progress");
        const areaScore = areaCompleted.reduce((sum: number, c: any) => sum + (c.result?.accuracy_percentage || 0), 0);
        const areaConsistency = areaCompleted.reduce((sum: number, c: any) => sum + (c.result?.consistency_index || 0), 0);
        
        return {
          id: area.id,
          name: area.name,
          is_active: area.is_active,
          totalCandidates: areaCandidates.length,
          completedTests: areaCompleted.length,
          inProgress: areaInProgress.length,
          averageScore: areaCompleted.length > 0 ? areaScore / areaCompleted.length : 0,
          avgConsistency: areaCompleted.length > 0 ? areaConsistency / areaCompleted.length : 0,
        };
      });

      // Find best area
      const bestArea = areaStats.length > 0 
        ? areaStats.filter((a: any) => a.completedTests > 0).sort((a: any, b: any) => b.averageScore - a.averageScore)[0] || null
        : null;

      // Calculate tests today
      const today = new Date().toISOString().split('T')[0];
      const testsToday = completedCandidates.filter((c: any) => 
        c.completed_at && c.completed_at.startsWith(today)
      ).length;

      // Abandonment rate (started but not completed)
      const abandonedTests = candidates.filter((c: any) => 
        c.status === "in_progress" && c.started_at && 
        (Date.now() - new Date(c.started_at).getTime()) > 60 * 60 * 1000 // More than 1 hour
      ).length;
      const abandonRate = startedTests > 0 ? (abandonedTests / startedTests) * 100 : 0;

      // Average consistency index
      const totalConsistency = completedCandidates.reduce((sum: number, c: any) => 
        sum + (c.result?.consistency_index || 0), 0);
      const avgConsistencyIndex = completedCandidates.length > 0 ? totalConsistency / completedCandidates.length : 0;

      // Top 5 candidates
      const topCandidates = completedCandidates
        .filter((c: any) => c.result?.accuracy_percentage)
        .sort((a: any, b: any) => b.result.accuracy_percentage - a.result.accuracy_percentage)
        .slice(0, 5)
        .map((c: any) => ({
          name: c.candidate_name,
          score: c.result.accuracy_percentage,
          area: c.area_name || "General",
          recommendation: c.result.recommendation,
        }));

      // Candidates by area for pie chart
      const candidatesByArea = areaStats
        .filter((a: any) => a.totalCandidates > 0)
        .map((a: any, idx: number) => ({
          name: a.name,
          value: a.totalCandidates,
          color: ["#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"][idx % 6],
        }));

      const stats = {
        totalCandidates: candidates.length,
        completedTests: completedCandidates.length,
        averageScore: completedCandidates.length > 0 ? totalScore / completedCandidates.length : 0,
        averageTime: completedCandidates.length > 0 ? totalTime / completedCandidates.length : 0,
        completionRate,
        avgTimePerQuestion,
        hardestQuestions,
        categoryPerformance,
        profileDistribution: Object.entries(profileCounts).map(([key, value]) => ({
          name: profileLabels[key] || key,
          value,
          color: profileColors[key] || "#888",
        })),
        recommendationDistribution: Object.entries(recommendationCounts).map(([key, value]) => ({
          name: recommendationLabels[key] || key,
          value,
          color: recommendationColors[key] || "#888",
        })),
        temporalData,
        // New enhanced stats
        testsToday,
        abandonRate,
        avgConsistencyIndex,
        candidatesInProgress: inProgressCandidates.length,
        bestArea: bestArea ? { name: bestArea.name, score: bestArea.averageScore } : null,
        areaStats,
        topCandidates,
        candidatesByArea,
      };

      return new Response(
        JSON.stringify({ candidates, stats, areas: allAreas || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Acción no válida" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  } catch (err) {
    console.error("psico-test-operations error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Error interno" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
