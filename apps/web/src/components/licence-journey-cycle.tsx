import { useCardGradient } from "@workspace/ui/hooks/use-card-gradient"
import {
  Carousel,
  CarouselContent,
  CarouselDots,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@workspace/ui/components/carousel"

type JourneyStep = {
  description: string
  keyword: string
  label: string
}

const journeySteps = [
  {
    description:
      "Choose the vehicle class you want to apply for, enter the required details, and review every answer before continuing.",
    keyword: "Learner Licence",
    label: "Apply for Learner Licence",
  },
  {
    description:
      "Confirm your identity, add the documents needed for the application, and check that each document is clear and current.",
    keyword: "identity",
    label: "Verify identity and documents",
  },
  {
    description:
      "Review the completed request, confirm the payable amount, and select a learner's test appointment that suits your schedule.",
    keyword: "book test",
    label: "Submit application and book test",
  },
  {
    description:
      "Recorded by DigiLicense only. No government service is contacted. Attend the learner's test at the scheduled time and pass it.",
    keyword: "receive LL",
    label: "Take the test and receive LL",
  },
] as const satisfies readonly JourneyStep[]

function JourneyCard({ step }: { step: JourneyStep }) {
  const [headingStart, headingEnd] = step.label.split(step.keyword)
  const cardGradient = useCardGradient()

  return (
    <article
      {...cardGradient}
      className="journey-step-card relative flex aspect-square h-full w-full flex-col overflow-hidden rounded-3xl px-3 pt-11 pb-3 text-left text-foreground/75 transition-shadow duration-300 ease-out hover:text-foreground hover:shadow-lg hover:shadow-[#d96b16]/20 sm:aspect-auto sm:min-h-[20rem] sm:p-5 lg:min-h-0"
    >
      <div className="relative z-10">
        <p className="font-heading text-2xl leading-7 font-semibold tracking-[-0.03em] lg:text-4xl lg:leading-10">
          {headingStart}
          <span className="text-[#d96b16] italic">{step.keyword}</span>
          {headingEnd}
        </p>
        <p className="font-description mt-4 line-clamp-4 text-xs leading-4 sm:line-clamp-none sm:text-sm sm:leading-5 lg:text-base lg:leading-6">
          {step.description}
        </p>
      </div>
    </article>
  )
}

function LicenceJourneyCycle() {
  return (
    <section
      aria-label="Learner's licence journey"
      className="mx-auto mt-12 w-full max-w-[calc(100%-2rem)] px-2 pb-12 sm:mt-16 sm:max-w-[calc(100%-14rem)] sm:px-4 lg:max-w-[calc(100%-10rem)] 2xl:max-w-[calc(100%-14rem)]"
    >
      <ol className="grid gap-4 px-3 py-8 sm:hidden">
        {journeySteps.map((step) => (
          <li key={step.label}>
            <JourneyCard step={step} />
          </li>
        ))}
      </ol>

      <Carousel
        className="hidden px-12 py-8 sm:block lg:hidden"
        opts={{ align: "start", loop: true }}
      >
        <CarouselContent>
          {journeySteps.map((step) => (
            <CarouselItem className="basis-full sm:basis-3/4" key={step.label}>
              <JourneyCard step={step} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselDots className="mt-4" />
        <CarouselPrevious className="top-1/2 bottom-auto left-0 z-20 -translate-y-1/2" />
        <CarouselNext className="top-1/2 right-0 bottom-auto z-20 -translate-y-1/2" />
      </Carousel>

      <ol className="hidden grid-cols-2 gap-2 p-4 lg:grid lg:gap-3 xl:grid-cols-4">
        {journeySteps.map((step) => (
          <li
            className="min-h-80 min-w-0 lg:min-h-64 2xl:min-h-72"
            key={step.label}
          >
            <JourneyCard step={step} />
          </li>
        ))}
      </ol>
    </section>
  )
}

export { LicenceJourneyCycle }
