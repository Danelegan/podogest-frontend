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
  // New key on every open: a fresh form each time, without unmounting the
  // modal mid-way through its exit animation.
  const [bookingKey, setBookingKey] = useState(0)

  const openBooking = (service) => {
    setSelectedService(service)
    setBookingKey((key) => key + 1)
    setIsModalOpen(true)
  }
  const openBookingModal = () => openBooking('')
  const requestService = (title) => openBooking(title)
  const closeBookingModal = () => setIsModalOpen(false)

  return (
    <>
      <Navbar onOpenBooking={openBookingModal} />
      <HeroSection onOpenBooking={openBookingModal} />
      <ServicesSection onRequestService={requestService} />
      <AboutSection />
      <BookingModal
        key={bookingKey}
        isOpen={isModalOpen}
        onClose={closeBookingModal}
        initialService={selectedService}
      />
      <Footer />
    </>
  )
}

export default LandingPage
