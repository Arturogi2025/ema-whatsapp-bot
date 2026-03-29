-- ============================================================
-- Seed data: portfolio_examples
-- Reemplaza URLs e imágenes con tus proyectos reales
-- ============================================================

INSERT INTO portfolio_examples (category, title, url, image_url, description) VALUES

-- Web (Páginas web corporativas / profesionales)
('web', 'Despacho Jurídico MX', 'https://boltdevlabs.com/portfolio/despacho-juridico', 'https://boltdevlabs.com/img/portfolio/despacho-juridico.jpg', 'Sitio web profesional para despacho de abogados con formulario de contacto y WhatsApp integrado'),
('web', 'Consultora Financiera', 'https://boltdevlabs.com/portfolio/consultora-financiera', 'https://boltdevlabs.com/img/portfolio/consultora-financiera.jpg', 'Página web con blog, calculadoras y reserva de citas en línea'),
('web', 'Clínica Dental Sonríe', 'https://boltdevlabs.com/portfolio/clinica-dental', 'https://boltdevlabs.com/img/portfolio/clinica-dental.jpg', 'Sitio web médico con galería de casos, reseñas y agendar citas por WhatsApp'),

-- Ecommerce (Tiendas en línea)
('ecommerce', 'Artesanías Oaxaca', 'https://boltdevlabs.com/portfolio/artesanias-oaxaca', 'https://boltdevlabs.com/img/portfolio/artesanias-oaxaca.jpg', 'Tienda en línea de artesanías con pagos con tarjeta y envío a todo México'),
('ecommerce', 'FitStore MX', 'https://boltdevlabs.com/portfolio/fitstore', 'https://boltdevlabs.com/img/portfolio/fitstore.jpg', 'E-commerce de suplementos deportivos con carrito, cupones y tracking de pedidos'),
('ecommerce', 'Boutique Luna', 'https://boltdevlabs.com/portfolio/boutique-luna', 'https://boltdevlabs.com/img/portfolio/boutique-luna.jpg', 'Tienda de ropa con catálogo visual, tallas y conexión a inventario'),

-- Landing pages
('landing', 'Lanzamiento App Fintech', 'https://boltdevlabs.com/portfolio/fintech-landing', 'https://boltdevlabs.com/img/portfolio/fintech-landing.jpg', 'Landing page de pre-registro con countdown, testimonios y CTA de descarga'),
('landing', 'Evento Tech Summit', 'https://boltdevlabs.com/portfolio/tech-summit', 'https://boltdevlabs.com/img/portfolio/tech-summit.jpg', 'Landing para evento con agenda, speakers, registro y mapa del venue'),
('landing', 'Promo Black Friday', 'https://boltdevlabs.com/portfolio/black-friday', 'https://boltdevlabs.com/img/portfolio/black-friday.jpg', 'Landing promocional con ofertas destacadas, timer y botón de WhatsApp'),

-- Custom (Sistemas a la medida)
('custom', 'CRM Inmobiliario KOVA', 'https://boltdevlabs.com/portfolio/kova-crm', 'https://boltdevlabs.com/img/portfolio/kova-crm.jpg', 'Sistema CRM completo para inmobiliarias con pipeline, citas y reportes'),
('custom', 'Dashboard Logística', 'https://boltdevlabs.com/portfolio/dashboard-logistica', 'https://boltdevlabs.com/img/portfolio/dashboard-logistica.jpg', 'Panel de control para empresa de envíos con tracking en tiempo real y reportes'),
('custom', 'Portal de Reservaciones', 'https://boltdevlabs.com/portfolio/reservaciones', 'https://boltdevlabs.com/img/portfolio/reservaciones.jpg', 'Sistema de reservas para restaurante con disponibilidad en vivo y confirmación por WhatsApp');
