-- Crear test base
INSERT INTO public.psico_tests (id, name, description, time_limit_minutes, is_active, target_positions, questions_count)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Test Psicotécnico General',
  'Evaluación completa de aptitudes cognitivas para procesos de selección',
  15,
  true,
  ARRAY['Comercial', 'Técnico', 'Gestión', 'Producción', 'Logística', 'Administración', 'Otro'],
  34
) ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 🧠 LÓGICA NUMÉRICA (6 preguntas)
-- =====================================================

INSERT INTO public.psico_questions (test_id, category, question_type, question_text, question_data, correct_answer, difficulty, time_limit_seconds, points, order_index)
VALUES 
-- 1. Serie numérica simple
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'logica_numerica', 'single_choice', 
 '¿Qué número continúa la serie: 2, 4, 6, 8, ...?',
 '{"options": ["9", "10", "12", "11"]}',
 '10', 1, 30, 1, 1),

-- 2. Operación incompleta
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'logica_numerica', 'single_choice',
 '15 + ? = 23',
 '{"options": ["7", "8", "9", "6"]}',
 '8', 1, 25, 1, 2),

-- 3. Comparación rápida
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'logica_numerica', 'single_choice',
 '¿Cuál es mayor: 3×4 o 2×7?',
 '{"options": ["3×4", "2×7", "Son iguales"]}',
 '2×7', 1, 20, 1, 3),

-- 4. Cálculo funcional
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'logica_numerica', 'single_choice',
 'Un reloj marca las 3:15. ¿Cuántos minutos faltan para las 4:00?',
 '{"options": ["35", "45", "55", "40"]}',
 '45', 1, 30, 1, 4),

-- 5. Proporción simple
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'logica_numerica', 'single_choice',
 'Si 3 manzanas cuestan 6€, ¿cuánto cuestan 5 manzanas?',
 '{"options": ["8€", "9€", "10€", "12€"]}',
 '10€', 2, 35, 1, 5),

-- 6. Secuencia Fibonacci
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'logica_numerica', 'single_choice',
 '¿Qué número sigue en la serie: 1, 1, 2, 3, 5, 8, ...?',
 '{"options": ["10", "11", "12", "13"]}',
 '13', 2, 40, 1, 6),

-- =====================================================
-- 👁️ RAZONAMIENTO VISUAL (8 preguntas)
-- =====================================================

-- 7. Serie de figuras - patrón de rotación
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'razonamiento_visual', 'single_choice',
 'Si una flecha gira 90° en sentido horario en cada paso: → ↓ ← ¿cuál sigue?',
 '{"options": ["↑", "→", "↓", "←"]}',
 '↑', 1, 30, 1, 7),

-- 8. Serie de figuras - incremento
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'razonamiento_visual', 'single_choice',
 '△ △△ △△△ ¿Qué viene después?',
 '{"options": ["△△△△", "△△", "△△△△△", "△"]}',
 '△△△△', 1, 25, 1, 8),

-- 9. Matriz Raven simplificada
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'razonamiento_visual', 'single_choice',
 'En una cuadrícula 3x3, si cada fila tiene ○ □ △ y cada columna también, ¿qué figura falta en la esquina inferior derecha si hay ○ y □ en esa fila?',
 '{"options": ["○", "□", "△", "◇"]}',
 '△', 2, 45, 1, 9),

-- 10. Matriz Raven - colores
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'razonamiento_visual', 'single_choice',
 'Si el patrón es: Rojo-Azul-Verde en fila 1, Azul-Verde-Rojo en fila 2, ¿qué color empieza la fila 3?',
 '{"options": ["Rojo", "Azul", "Verde", "Amarillo"]}',
 'Verde', 2, 40, 1, 10),

-- 11. Rotación de figura
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'razonamiento_visual', 'single_choice',
 'Si rotamos la letra "L" 180°, ¿cómo queda?',
 '{"options": ["L", "⌐", "˥", "Γ"]}',
 '˥', 1, 30, 1, 11),

-- 12. Simetría
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'razonamiento_visual', 'single_choice',
 '¿Cuál de estas letras tiene simetría vertical perfecta?',
 '{"options": ["R", "A", "F", "G"]}',
 'A', 1, 25, 1, 12),

-- 13. Exclusión de elemento
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'razonamiento_visual', 'single_choice',
 '¿Cuál no pertenece al grupo: ○ □ △ ☆ ?',
 '{"options": ["○", "□", "△", "☆"], "hint": "Piensa en el número de lados"}',
 '○', 2, 35, 1, 13),

-- 14. Plegado mental
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'razonamiento_visual', 'single_choice',
 'Si doblas un papel cuadrado por la mitad horizontalmente y luego verticalmente, ¿cuántas capas tendrás?',
 '{"options": ["2", "3", "4", "6"]}',
 '4', 2, 40, 1, 14),

-- =====================================================
-- 🎯 ATENCIÓN Y PERCEPCIÓN (5 preguntas)
-- =====================================================

-- 15. Detección de diferencias
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'atencion_percepcion', 'single_choice',
 'En la secuencia "ABCDEFGHIJKLMNOPQRSTUVWXYZ", ¿qué letra está en la posición 13?',
 '{"options": ["L", "M", "N", "O"]}',
 'M', 1, 30, 1, 15),

-- 16. Detección de diferencias 2
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'atencion_percepcion', 'single_choice',
 'Encuentra el elemento diferente: 0 0 0 O 0 0 0',
 '{"options": ["Posición 1", "Posición 3", "Posición 4", "Posición 6"]}',
 'Posición 4', 1, 20, 1, 16),

-- 17. Patrón visual
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'atencion_percepcion', 'single_choice',
 '¿Cuántas veces aparece la letra "e" en: "El perro de Elena es excelente"?',
 '{"options": ["4", "5", "6", "7"]}',
 '6', 1, 35, 1, 17),

-- 18. Figuras ocultas
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'atencion_percepcion', 'single_choice',
 'En un hexágono regular, ¿cuántos triángulos se pueden formar trazando todas las diagonales desde el centro?',
 '{"options": ["4", "5", "6", "8"]}',
 '6', 2, 40, 1, 18),

-- 19. Conteo rápido
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'atencion_percepcion', 'single_choice',
 'Cuenta los números pares: 3, 8, 5, 2, 9, 4, 7, 6, 1',
 '{"options": ["3", "4", "5", "6"]}',
 '4', 1, 25, 1, 19),

-- =====================================================
-- 📚 LÓGICA VERBAL (5 preguntas)
-- =====================================================

-- 20. Inferencia
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'logica_verbal', 'single_choice',
 'María es más alta que Juan. Pedro es más bajo que Juan. ¿Quién es el más alto?',
 '{"options": ["María", "Juan", "Pedro", "No se puede saber"]}',
 'María', 1, 35, 1, 20),

-- 21. Sinónimos
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'logica_verbal', 'single_choice',
 '¿Cuál es sinónimo de "veloz"?',
 '{"options": ["Lento", "Rápido", "Pesado", "Suave"]}',
 'Rápido', 1, 20, 1, 21),

-- 22. Analogías
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'logica_verbal', 'single_choice',
 'Libro es a biblioteca como coche es a...',
 '{"options": ["Carretera", "Garaje", "Rueda", "Conductor"]}',
 'Garaje', 1, 30, 1, 22),

-- 23. Comprensión
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'logica_verbal', 'single_choice',
 '"Ana llegó antes que Pedro, pero después de Luis." ¿Quién llegó primero?',
 '{"options": ["Ana", "Pedro", "Luis", "Llegaron juntos"]}',
 'Luis', 2, 35, 1, 23),

-- 24. Secuencia lógica verbal
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'logica_verbal', 'single_choice',
 'Completa: "Todos los perros son animales. Max es un perro. Por lo tanto..."',
 '{"options": ["Max es grande", "Max es un animal", "Max es rápido", "Max es un gato"]}',
 'Max es un animal', 1, 30, 1, 24),

-- =====================================================
-- ⚡ VELOCIDAD (4 preguntas - 10-15 segundos)
-- =====================================================

-- 25. Suma rápida
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'velocidad', 'single_choice',
 '¿Cuánto es 7 + 8?',
 '{"options": ["14", "15", "16", "17"]}',
 '15', 1, 10, 1, 25),

-- 26. Conocimiento general
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'velocidad', 'single_choice',
 '¿De qué color es el cielo en un día despejado?',
 '{"options": ["Verde", "Azul", "Rojo", "Amarillo"]}',
 'Azul', 1, 8, 1, 26),

-- 27. Geografía básica
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'velocidad', 'single_choice',
 '¿Cuál es la capital de España?',
 '{"options": ["Barcelona", "Madrid", "Sevilla", "Valencia"]}',
 'Madrid', 1, 8, 1, 27),

-- 28. División rápida
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'velocidad', 'single_choice',
 '20 ÷ 4 = ?',
 '{"options": ["4", "5", "6", "8"]}',
 '5', 1, 10, 1, 28),

-- =====================================================
-- 🧩 MEMORIA VISUAL (3 preguntas)
-- =====================================================

-- 29. Memoria de secuencia
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'memoria_visual', 'memory',
 'Memoriza este patrón y selecciona el correcto',
 '{"pattern": "🔴🔵🟢🟡", "display_time": 5, "options": ["🔴🔵🟢🟡", "🔴🟢🔵🟡", "🔵🔴🟢🟡", "🔴🔵🟡🟢"]}',
 '🔴🔵🟢🟡', 2, 15, 1, 29),

-- 30. Memoria de números
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'memoria_visual', 'memory',
 'Memoriza esta secuencia de números',
 '{"pattern": "7-3-9-1-5", "display_time": 5, "options": ["7-3-9-1-5", "7-3-1-9-5", "7-9-3-1-5", "3-7-9-1-5"]}',
 '7-3-9-1-5', 2, 15, 1, 30),

-- 31. Memoria de figuras
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'memoria_visual', 'memory',
 'Memoriza esta secuencia de símbolos',
 '{"pattern": "★◆●▲", "display_time": 5, "options": ["★◆●▲", "◆★●▲", "★●◆▲", "★◆▲●"]}',
 '★◆●▲', 2, 15, 1, 31),

-- =====================================================
-- 🎲 CONSISTENCIA (3 preguntas - variaciones ocultas)
-- =====================================================

-- 32. Variación de pregunta 3 (comparación)
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'consistencia', 'single_choice',
 '¿Cuál tiene mayor valor: 2×7 o 3×4?',
 '{"options": ["2×7", "3×4", "Tienen el mismo valor"]}',
 '2×7', 1, 20, 1, 32),

-- 33. Variación de pregunta 20 (inferencia)
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'consistencia', 'single_choice',
 'Laura es más baja que Carlos. Carlos es más bajo que Miguel. ¿Quién es el más bajo?',
 '{"options": ["Miguel", "Carlos", "Laura", "No se puede determinar"]}',
 'Laura', 1, 35, 1, 33),

-- 34. Variación de pregunta 22 (analogías)
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'consistencia', 'single_choice',
 'Avión es a hangar como barco es a...',
 '{"options": ["Mar", "Puerto", "Vela", "Capitán"]}',
 'Puerto', 1, 30, 1, 34);

-- Asignar consistency_pair_id para preguntas de consistencia
UPDATE public.psico_questions 
SET consistency_pair_id = (SELECT id FROM public.psico_questions WHERE order_index = 3 AND test_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' LIMIT 1)
WHERE order_index = 32 AND test_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

UPDATE public.psico_questions 
SET consistency_pair_id = (SELECT id FROM public.psico_questions WHERE order_index = 20 AND test_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' LIMIT 1)
WHERE order_index = 33 AND test_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

UPDATE public.psico_questions 
SET consistency_pair_id = (SELECT id FROM public.psico_questions WHERE order_index = 22 AND test_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' LIMIT 1)
WHERE order_index = 34 AND test_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';