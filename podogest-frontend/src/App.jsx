import { useState } from 'react'
import Navbar from './components/Navbar'
import HeroSection from './components/HeroSection'
import ServicesSection from './components/ServicesSection'
import AboutSection from './components/AboutSection'
import BookingModal from './components/BookingModal'
import Footer from './components/Footer'

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const openBookingModal = () => setIsModalOpen(true)
  const closeBookingModal = () => setIsModalOpen(false)

  return (
    <>
      <Navbar onOpenBooking={openBookingModal} />
      <HeroSection onOpenBooking={openBookingModal} />
      <ServicesSection />
      <AboutSection />
      <BookingModal isOpen={isModalOpen} onClose={closeBookingModal} />
      <Footer />
    </>
  )
}

export default App
