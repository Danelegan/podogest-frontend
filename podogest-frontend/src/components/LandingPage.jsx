import { useState } from 'react'
import Navbar from './Navbar'
import HeroSection from './HeroSection'
import ServicesSection from './ServicesSection'
import AboutSection from './AboutSection'
import BookingModal from './BookingModal'
import Footer from './Footer'

function LandingPage() {
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

export default LandingPage
