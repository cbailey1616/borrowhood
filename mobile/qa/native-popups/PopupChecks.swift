
import XCTest
final class PopupChecks: XCTestCase {
  func testPopupsAboveNativeSheets() {
    let app = XCUIApplication(bundleIdentifier: "com.borrowhood.app")
    app.terminate()
    app.launch()
    let server = app.staticTexts["http://localhost:8083"]
    if server.waitForExistence(timeout: 4) { server.tap() }
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    if springboard.buttons["Open"].waitForExistence(timeout: 3) { springboard.buttons["Open"].tap() }
    if app.buttons["Open"].waitForExistence(timeout: 2) { app.buttons["Open"].tap() }
    XCTAssertTrue(app.buttons["Open posting sheet"].waitForExistence(timeout: 60))
    app.buttons["Open posting sheet"].tap()
    if !app.buttons["Change who can see this item"].waitForExistence(timeout: 5) { app.buttons["Open posting sheet"].tap() }
    XCTAssertTrue(app.buttons["Change who can see this item"].waitForExistence(timeout: 10))
    app.buttons["Change who can see this item"].tap()
    let neighborhood = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Neighborhood")).firstMatch
    for _ in 0..<3 {
      if !neighborhood.exists { app.buttons["Change who can see this item"].tap() }
    neighborhood.tap()
      XCTAssertTrue(app.staticTexts["Find your neighborhood"].waitForExistence(timeout: 5))
      app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Not now")).firstMatch.tap()
      XCTAssertTrue(app.buttons["Show global confirmation"].isHittable)
    }
    app.buttons["Show global confirmation"].tap()
    XCTAssertTrue(app.staticTexts["Visible above the sheet"].waitForExistence(timeout: 5))
    let shot = XCTAttachment(screenshot: app.screenshot()); shot.name="Global popup above posting sheet"; shot.lifetime = .keepAlways; add(shot)
    app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Confirm check")).firstMatch.tap()
    XCTAssertTrue(app.staticTexts["Confirmed 1"].waitForExistence(timeout: 5))
    app.buttons["Show global error"].tap()
    XCTAssertTrue(app.staticTexts["Connection check"].waitForExistence(timeout: 5))
    app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Retry check")).firstMatch.tap()
    XCTAssertTrue(app.staticTexts["Confirmed 2"].waitForExistence(timeout: 5))
    app.buttons["Open native modal"].tap()
    app.buttons["Show nested confirmation"].tap()
    XCTAssertTrue(app.staticTexts["Visible above the sheet"].waitForExistence(timeout: 5))
    app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Confirm check")).firstMatch.tap()
    app.buttons["Close native modal"].tap()
    XCTAssertTrue(app.staticTexts["Confirmed 3"].waitForExistence(timeout: 5))
    if !neighborhood.exists { app.buttons["Change who can see this item"].tap() }
    neighborhood.tap()
    app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Join a neighborhood")).firstMatch.tap()
    XCTAssertTrue(app.staticTexts["Join neighborhood"].waitForExistence(timeout: 5))
    Thread.sleep(forTimeInterval: 1)
    app.buttons["Return to draft"].tap()
    XCTAssertTrue(app.buttons["Change who can see this item"].waitForExistence(timeout: 10))
    Thread.sleep(forTimeInterval: 1)
    if !neighborhood.exists { app.buttons["Change who can see this item"].tap() }
    neighborhood.tap()
    app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Create a neighborhood")).firstMatch.tap()
    XCTAssertTrue(app.staticTexts["Create neighborhood"].waitForExistence(timeout: 5))
    Thread.sleep(forTimeInterval: 1)
    app.buttons["Return to draft"].tap()
    XCTAssertTrue(app.buttons["Change who can see this item"].waitForExistence(timeout: 10))
    Thread.sleep(forTimeInterval: 1)
    app.buttons["Close posting sheet"].tap()
    XCTAssertTrue(app.buttons["Open posting sheet"].isHittable)
  }
}
