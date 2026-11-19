import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from './Navbar'
import HeroSection from './HeroSection'
import ServicesSection from './ServicesSection'
import AboutSection from './AboutSection'
import BookingModal from './BookingModal'
import Footer from './Footer'

// openBookingOnLoad: /reservar, the direct booking link (Google Maps). The
// landing renders as usual with the modal already open.
function LandingPage({ openBookingOnLoad = false }) {
  const navigate = useNavigate()
  const [isModalOpen, setIsModalOpen] = useState(openBookingOnLoad)
  const heroTitleRef = useRef(null)
  const focusHeroOnCloseRef = useRef(false)

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
  const closeBookingModal = () => {
    setIsModalOpen(false)
    // Replace, not push: Back then leaves the site (e.g. to Maps) instead of
    // landing on /reservar and reopening the modal.
    if (openBookingOnLoad) {
      focusHeroOnCloseRef.current = true
      navigate('/', { replace: true })
    }
  }

  // Opened from the URL there is no button to hand focus back to, so it goes to
  // the hero title. Not done in the close callback: the page is still inert
  // until BookingModal's effect cleanup, which React runs before this effect.
  useEffect(() => {
    if (isModalOpen || !focusHeroOnCloseRef.current) return
    focusHeroOnCloseRef.current = false
    heroTitleRef.current?.focus()
  }, [isModalOpen])

  return (
    <>
      <Navbar onOpenBooking={openBookingModal} />
      <HeroSection
        onOpenBooking={openBookingModal}
        onRequestService={requestService}
        titleRef={heroTitleRef}
      />
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
