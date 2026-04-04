-- ============================================================
-- Seed data: portfolio_examples
-- Descriptions are used by the AI for context/personalization.
-- The AI shares https://www.boltdevlabs.com/portfolio as a single link.
-- image_url is NULL — we don't send individual images via WhatsApp.
-- ============================================================

INSERT INTO portfolio_examples (category, title, url, image_url, description) VALUES

-- Web (Páginas web corporativas / profesionales)
('web', 'Despacho Jurídico MX', 'https://www.boltdevlabs.com/portfolio', NULL, 'Sitio web profesional para despacho de abogados con formulario de contacto y WhatsApp integrado'),
('web', 'Consultora Financiera', 'https://www.boltdevlabs.com/portfolio', NULL, 'Página web con blog, calculadoras y reserva de citas en línea'),
('web', 'Clínica Dental Sonríe', 'https://www.boltdevlabs.com/portfolio', NULL, 'Sitio web médico con galería de casos, reseñas y agendar citas por WhatsApp'),

-- Ecommerce (Tiendas en línea)
('ecommerce', 'Artesanías Oaxaca', 'https://www.boltdevlabs.com/portfolio', NULL, 'Tienda en línea de artesanías con pagos con tarjeta y envío a todo México'),
('ecommerce', 'FitStore MX', 'https://www.boltdevlabs.com/portfolio', NULL, 'E-commerce de suplementos deportivos con carrito, cupones y tracking de pedidos'),
('ecommerce', 'Boutique Luna', 'https://www.boltdevlabs.com/portfolio', NULL, 'Tienda de ropa con catálogo visual, tallas y conexión a inventario'),

-- Landing pages
('landing', 'Lanzamiento App Fintech', 'https://www.boltdevlabs.com/portfolio', NULL, 'Landing page de pre-registro con countdown, testimonios y CTA de descarga'),
('landing', 'Evento Tech Summit', 'https://www.boltdevlabs.com/portfolio', NULL, 'Landing para evento con agenda, speakers, registro y mapa del venue'),
('landing', 'Promo Black Friday', 'https://www.boltdevlabs.com/portfolio', NULL, 'Landing promocional con ofertas destacadas, timer y botón de WhatsApp'),

-- Custom (Sistemas a la medida)
('custom', 'CRM Inmobiliario KOVA', 'https://www.boltdevlabs.com/portfolio', NULL, 'Sistema CRM completo para inmobiliarias con pipeline, citas y reportes'),
('custom', 'Dashboard Logística', 'https://www.boltdevlabs.com/portfolio', NULL, 'Panel de control para empresa de envíos con tracking en tiempo real y reportes'),
('custom', 'Portal de Reservaciones', 'https://www.boltdevlabs.com/portfolio', NULL, 'Sistema de reservas para restaurante con disponibilidad en vivo y confirmación por WhatsApp');
