-- Optional test data. NOT executed; never apply automatically.
insert into public.alertas (entidad, contexto, prioridad, trends_activo, trends_crecimiento, angulo, seccion_sugerida, motivo_afinidad) values
('Negociación de los Presupuestos', 'Alerta de prueba sobre presupuestos', 'alta', true, '2000+', 'Qué partidas están en juego', 'Política', 'Impacto institucional y económico'),
('IPC adelantado', 'Alerta de prueba sobre inflación', 'media', true, '1000+', 'Qué cambia en la cesta de la compra', 'Economía', 'Lectura práctica del dato macro'),
('Cambios en la PAU', 'Alerta de prueba sobre educación', 'media', true, '500+', 'Qué cambia para estudiantes y familias', 'Sociedad', 'Guía práctica de educación');
