import { useState } from 'react'
import Navbar from './components/Navbar'
import HeroSection from './components/HeroSection'
import ServicesSection from './components/ServicesSection'
import AboutSection from './components/AboutSection'
import BookingModal from './components/BookingModal'
import Footer from './components/Footer'

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [selectedService, setSelectedService] = useState('')

  const openBookingModal = () => setIsModalOpen(true)
  const requestService = (title) => {
    setSelectedService(title)
    setIsModalOpen(true)
  }
  const closeBookingModal = () => {
    setIsModalOpen(false)
    setSelectedService('')
  }

  return (
    <>
      <Navbar onOpenBooking={openBookingModal} />
      <HeroSection onOpenBooking={openBookingModal} />
      <ServicesSection onRequestService={requestService} />
      <AboutSection />
      <BookingModal
        key={selectedService}
        isOpen={isModalOpen}
        onClose={closeBookingModal}
        initialService={selectedService}
      />
      <Footer />
    </>
  )
}

export default App
