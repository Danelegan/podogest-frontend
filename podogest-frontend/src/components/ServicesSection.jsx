import './ServicesSection.css'

const servicesData = [
  {
    id: 'atencion-integral',
    title: 'Atención Integral',
    description:
      'Evaluación y cuidado completo de tus pies, con protocolos clínicos pensados para tu bienestar general.',
    imagePath: 'atencion_integral.jpeg',
    price: '$20.000',
  },
  {
    id: 'onicomicosis',
    title: 'Onicomicosis',
    description:
      'Diagnóstico y tratamiento de hongos en las uñas con técnicas que cuidan tu piel y previenen recaídas.',
    imagePath: 'Onicomicosis.jpeg',
    price: '$25.000',
  },
  {
    id: 'pie-diabetico',
    title: 'Pie Diabético',
    description:
      'Control y prevención especializado para pacientes diabéticos, reduciendo el riesgo de complicaciones.',
    imagePath: 'Pie_diabetico.jpeg',
    price: '$30.000',
  },
  {
    id: 'onicocriptosis',
    title: 'Onicocriptosis',
    description:
      'Corrección de uñas encarnadas para aliviar el dolor y evitar infecciones a futuro.',
    imagePath: 'Onicocriptosis.jpeg',
    price: '$22.000',
  },
  {
    id: 'Dermatomicosis',
    title: 'Dermatomicosis',
    description:
      'Tratamiento especializado para el tratamiento de dermatomicosis (hongos) en los pies.',
    imagePath: 'dermatomicosis.jpeg',
    price: '$25.000',
  },
  {
    id: 'Masoterapia y reflexología ',
    title: 'Reflexología y Masoterapia',
    description:
      'Sesión de relajación y estimulación circulatoria para aliviar la tensión acumulada en tus pies.',
    imagePath: 'reflexologia.jpeg',
    price: '$35.000',
  },

  {
    id: 'Reconstrucción Ungeal',
    title: 'Reconstrucción Ungeal',
    description:
      'Tratamiento especializado para la reconstrucción de uñas dañadas.',
    imagePath: 'reconstruccion.jpeg',
    price: '$28.000',
  },

  {
    id: 'verrugas-plantares',
    title: 'Verrugas Plantares',
    description:
      'Tratamiento seguro de verrugas en la planta del pie, con seguimiento hasta su eliminación completa.',
    imagePath: 'verrugas.jpeg',
    price: '$25.000',
  },

  {
    id: 'Deslaminación de Durezas y Helomas',
    title: 'Deslaminación de Durezas y Helomas',
    description:
      'Tratamiento especializado para la eliminación de durezas, callos y helomas en los pies.',
    imagePath: 'Callos.jpeg',
    price: '$20.000',
  },
]

function ServiceCard({ title, description, imagePath, price }) {
  return (
    <article className="service-card">
      <div className="service-card__image-wrapper">
        <img
          src={imagePath}
          alt={title}
          className="service-card__image"
          loading="lazy"
        />
        {price && <span className="service-card__price">{price}</span>}
      </div>
      <h3 className="service-card__title">{title}</h3>
      <p className="service-card__description">{description}</p>
    </article>
  )
}

function ServicesSection() {
  return (
    <section className="services" id="servicios">
      <div className="services__container">
        <div className="services__header">
          <h2 className="services__title">Nuestros Servicios</h2>
          <p className="services__subtitle">
            Cuidado podológico profesional adaptado a las necesidades de tus pies.
          </p>
        </div>

        <div className="services__grid">
          {servicesData.map((service) => (
            <ServiceCard key={service.id} {...service} />
          ))}
        </div>
      </div>
    </section>
  )
}

export default ServicesSection
