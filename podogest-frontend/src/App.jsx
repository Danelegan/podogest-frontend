import { useState } from 'react'
import Navbar from './components/Navbar'
import HeroSection from './components/HeroSection'
import ServicesSection from './components/ServicesSection'
import BookingModal from './components/BookingModal'

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const openBookingModal = () => setIsModalOpen(true)
  const closeBookingModal = () => setIsModalOpen(false)

  return (
    <>
      <Navbar onOpenBooking={openBookingModal} />
      <HeroSection onOpenBooking={openBookingModal} />
      <ServicesSection />
      <BookingModal isOpen={isModalOpen} onClose={closeBookingModal} />
    </>
  )
}

export default App
