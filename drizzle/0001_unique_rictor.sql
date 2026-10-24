CREATE TABLE `drivers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` text NOT NULL,
	`phone` varchar(32) NOT NULL,
	`zone` varchar(120) NOT NULL,
	`experience` int NOT NULL DEFAULT 0,
	`licenseNumber` varchar(120) NOT NULL,
	`documentNote` text NOT NULL,
	`vehiclePlate` varchar(32) NOT NULL,
	`verification` enum('pending','verified','rejected','suspended') NOT NULL DEFAULT 'pending',
	`rejectionReason` text,
	`available` boolean NOT NULL DEFAULT false,
	`rating` double NOT NULL DEFAULT 5,
	`trips` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drivers_id` PRIMARY KEY(`id`),
	CONSTRAINT `drivers_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rideId` int NOT NULL,
	`driverId` int NOT NULL,
	`status` enum('sent','accepted','rejected','expired') NOT NULL DEFAULT 'sent',
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `offers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pricing_settings` (
	`id` int NOT NULL,
	`baseFare` int NOT NULL,
	`perKm` int NOT NULL,
	`minFare` int NOT NULL,
	`nightFee` int NOT NULL,
	`peakFee` int NOT NULL,
	`commissionPercent` double NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pricing_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ride_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rideId` int,
	`message` text NOT NULL,
	`actorName` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ride_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(40) NOT NULL,
	`customerId` int NOT NULL,
	`driverId` int,
	`pickup` text NOT NULL,
	`dropoff` text NOT NULL,
	`zone` varchar(120) NOT NULL,
	`distanceKm` double NOT NULL,
	`scheduledAt` timestamp NOT NULL,
	`vehicleType` enum('automatic','manual','luxury') NOT NULL,
	`phone` varchar(32) NOT NULL,
	`note` text NOT NULL,
	`price` int NOT NULL,
	`driverIncome` int NOT NULL,
	`status` enum('pending','offered','accepted','arriving','met','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
	`customerName` text NOT NULL,
	`driverName` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rides_id` PRIMARY KEY(`id`),
	CONSTRAINT `rides_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','driver','admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
CREATE INDEX `drivers_verification_available_idx` ON `drivers` (`verification`,`available`);--> statement-breakpoint
CREATE INDEX `offers_driver_status_idx` ON `offers` (`driverId`,`status`);--> statement-breakpoint
CREATE INDEX `offers_ride_status_idx` ON `offers` (`rideId`,`status`);--> statement-breakpoint
CREATE INDEX `ride_events_ride_created_idx` ON `ride_events` (`rideId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `rides_customer_status_idx` ON `rides` (`customerId`,`status`);--> statement-breakpoint
CREATE INDEX `rides_driver_status_idx` ON `rides` (`driverId`,`status`);--> statement-breakpoint
CREATE INDEX `rides_scheduled_status_idx` ON `rides` (`scheduledAt`,`status`);
