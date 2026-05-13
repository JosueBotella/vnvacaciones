-- First drop the check constraint and recreate with new types
ALTER TABLE psico_questions DROP CONSTRAINT IF EXISTS psico_questions_question_type_check;

-- Add new question types - using existing 'multiple_choice' type for all new questions
-- The frontend components will handle the rendering based on question_data

-- Insert questions using 'multiple_choice' type (supported)
INSERT INTO psico_questions (test_id, category, question_type, question_text, question_data, correct_answer, time_limit_seconds, points, order_index)
SELECT 
  id as test_id,
  'razonamiento_visual',
  'multiple_choice',
  '¿Qué dominó completa la serie? [1|2] → [2|3] → [3|4] → ?',
  '{"options": [{"id": "A", "text": "4|5"}, {"id": "B", "text": "5|4"}, {"id": "C", "text": "4|4"}, {"id": "D", "text": "3|5"}]}'::jsonb,
  'A', 30, 2, 35
FROM psico_tests WHERE is_active = true LIMIT 1;

INSERT INTO psico_questions (test_id, category, question_type, question_text, question_data, correct_answer, time_limit_seconds, points, order_index)
SELECT id, 'velocidad', 'multiple_choice', '¿Verdadero o Falso? 15 × 3 = 45',
  '{"options": [{"id": "A", "text": "Verdadero"}, {"id": "B", "text": "Falso"}]}'::jsonb,
  'A', 8, 1, 36
FROM psico_tests WHERE is_active = true LIMIT 1;

INSERT INTO psico_questions (test_id, category, question_type, question_text, question_data, correct_answer, time_limit_seconds, points, order_index)
SELECT id, 'velocidad', 'multiple_choice', 'Calcula rápidamente: 25 - 8 = ?',
  '{"options": [{"id": "A", "text": "15"}, {"id": "B", "text": "17"}, {"id": "C", "text": "18"}, {"id": "D", "text": "16"}]}'::jsonb,
  'B', 10, 1, 37
FROM psico_tests WHERE is_active = true LIMIT 1;

INSERT INTO psico_questions (test_id, category, question_type, question_text, question_data, correct_answer, time_limit_seconds, points, order_index)
SELECT id, 'velocidad', 'multiple_choice', 'Clasifica: MANZANA es un/una...',
  '{"options": [{"id": "A", "text": "Animal"}, {"id": "B", "text": "Fruta"}, {"id": "C", "text": "Objeto"}, {"id": "D", "text": "Acción"}]}'::jsonb,
  'B', 8, 1, 38
FROM psico_tests WHERE is_active = true LIMIT 1;

INSERT INTO psico_questions (test_id, category, question_type, question_text, question_data, correct_answer, time_limit_seconds, points, order_index)
SELECT id, 'logica_numerica', 'multiple_choice', '¿Qué número completa la secuencia? 2, 4, 8, 16, ?',
  '{"options": [{"id": "A", "text": "24"}, {"id": "B", "text": "32"}, {"id": "C", "text": "20"}, {"id": "D", "text": "28"}]}'::jsonb,
  'B', 25, 2, 39
FROM psico_tests WHERE is_active = true LIMIT 1;

INSERT INTO psico_questions (test_id, category, question_type, question_text, question_data, correct_answer, time_limit_seconds, points, order_index)
SELECT id, 'logica_numerica', 'multiple_choice', 'Fibonacci: 1, 1, 2, 3, 5, ?',
  '{"options": [{"id": "A", "text": "6"}, {"id": "B", "text": "7"}, {"id": "C", "text": "8"}, {"id": "D", "text": "9"}]}'::jsonb,
  'C', 25, 2, 40
FROM psico_tests WHERE is_active = true LIMIT 1;

INSERT INTO psico_questions (test_id, category, question_type, question_text, question_data, correct_answer, time_limit_seconds, points, order_index)
SELECT id, 'logica_verbal', 'multiple_choice', 'LIBRO es a LEER como CANCIÓN es a:',
  '{"options": [{"id": "A", "text": "Música"}, {"id": "B", "text": "Escuchar"}, {"id": "C", "text": "Cantar"}, {"id": "D", "text": "Radio"}]}'::jsonb,
  'B', 25, 2, 41
FROM psico_tests WHERE is_active = true LIMIT 1;

INSERT INTO psico_questions (test_id, category, question_type, question_text, question_data, correct_answer, time_limit_seconds, points, order_index)
SELECT id, 'logica_verbal', 'multiple_choice', '¿Qué letra sigue? A, C, E, G, ?',
  '{"options": [{"id": "A", "text": "H"}, {"id": "B", "text": "I"}, {"id": "C", "text": "J"}, {"id": "D", "text": "K"}]}'::jsonb,
  'B', 20, 1, 42
FROM psico_tests WHERE is_active = true LIMIT 1;